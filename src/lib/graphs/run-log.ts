import { createSupabaseAdminClient } from '@/lib/supabase/server';
import type { AgentArtifact } from '@/lib/orchestration/contracts';

export type Workflow = 'jd_intake' | 'resume_intake' | 'candidate_analysis' | 'transcript_review';

/**
 * Persists a row in agent_runs for each graph execution. This is the in-app
 * audit trail; LangSmith holds the full prompt/response traces.
 */
export async function startRun(params: {
  workflow: Workflow;
  userId: string;
  jobId?: string | null;
  candidateId?: string | null;
  input?: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from('agent_runs')
      .insert({
        workflow: params.workflow,
        job_id: params.jobId ?? null,
        candidate_id: params.candidateId ?? null,
        input: params.input ?? {},
        created_by: params.userId,
        status: 'running',
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id as string;
  } catch (error) {
    // Never let observability break the workflow.
    console.error('[run-log] failed to open run', error);
    return null;
  }
}

export async function finishRun(
  runId: string | null,
  update: {
    status: 'complete' | 'failed';
    currentNode?: string | null;
    output?: Record<string, unknown> | null;
    nodeTimings?: Array<{ node: string; ms: number }>;
    error?: string | null;
  }
) {
  if (!runId) return;

  try {
    await createSupabaseAdminClient()
      .from('agent_runs')
      .update({
        status: update.status,
        current_node: update.currentNode ?? null,
        output: update.output ?? null,
        node_timings: update.nodeTimings ?? [],
        error: update.error ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);
  } catch (error) {
    console.error('[run-log] failed to close run', error);
  }
}

export async function mergeRunOutput(
  runId: string | null,
  output: Record<string, unknown>
): Promise<void> {
  if (!runId) return;

  try {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from('agent_runs').select('output').eq('id', runId).maybeSingle();
    if (error) throw error;

    await db
      .from('agent_runs')
      .update({ output: { ...((data?.output as Record<string, unknown> | null) ?? {}), ...output } })
      .eq('id', runId);
  } catch (error) {
    console.error('[run-log] failed to merge run output', error);
  }
}

export async function createAgentTask(params: {
  runId: string;
  agentName: string;
  taskType: string;
  idempotencyKey: string;
  dependencyIds?: string[];
  inputArtifactIds?: string[];
  maxAttempts?: number;
}): Promise<string | null> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from('agent_tasks')
      .upsert(
        {
          run_id: params.runId,
          agent_name: params.agentName,
          task_type: params.taskType,
          idempotency_key: params.idempotencyKey,
          dependency_ids: params.dependencyIds ?? [],
          input_artifact_ids: params.inputArtifactIds ?? [],
          max_attempts: params.maxAttempts ?? 3,
        },
        { onConflict: 'idempotency_key', ignoreDuplicates: true }
      )
      .select('id')
      .maybeSingle();

    if (error) throw error;
    return (data?.id as string | undefined) ?? null;
  } catch (error) {
    console.error('[run-log] failed to create agent task', error);
    return null;
  }
}

export async function startAgentTask(taskId: string): Promise<void> {
  await createSupabaseAdminClient()
    .from('agent_tasks')
    .update({
      status: 'running',
      attempt: 1,
      started_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('status', 'pending');
}

export async function completeAgentTask(taskId: string, artifactId?: string | null): Promise<void> {
  await createSupabaseAdminClient()
    .from('agent_tasks')
    .update({
      status: 'complete',
      output_artifact_id: artifactId ?? null,
      finished_at: new Date().toISOString(),
      error: null,
    })
    .eq('id', taskId);
}

export async function failAgentTask(taskId: string, error: string): Promise<void> {
  await createSupabaseAdminClient()
    .from('agent_tasks')
    .update({ status: 'failed', error, finished_at: new Date().toISOString() })
    .eq('id', taskId);
}

export async function persistAgentArtifact<T>(artifact: AgentArtifact<T>): Promise<string | null> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from('agent_artifacts')
      .insert({
        run_id: artifact.runId,
        task_id: artifact.taskId ?? null,
        artifact_type: artifact.artifactType,
        schema_version: artifact.schemaVersion,
        producer: artifact.producer,
        consumer: artifact.consumer ?? null,
        status: artifact.status,
        payload: artifact.payload,
        evidence: artifact.evidence,
        warnings: artifact.warnings,
        confidence: artifact.confidence,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id as string;
  } catch (error) {
    console.error('[run-log] failed to persist agent artifact', error);
    return null;
  }
}

export async function recordAgentEvent(params: {
  runId: string;
  taskId?: string | null;
  eventType: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    await createSupabaseAdminClient().from('agent_events').insert({
      run_id: params.runId,
      task_id: params.taskId ?? null,
      event_type: params.eventType,
      payload: params.payload ?? {},
    });
  } catch (error) {
    console.error('[run-log] failed to record agent event', error);
  }
}

/** Times a graph node and records it against the run. */
export class NodeTimer {
  private readonly timings: Array<{ node: string; ms: number }> = [];
  private lastNode: string | null = null;

  async track<T>(node: string, fn: () => Promise<T>): Promise<T> {
    const started = Date.now();
    this.lastNode = node;
    try {
      return await fn();
    } finally {
      this.timings.push({ node, ms: Date.now() - started });
    }
  }

  get results() {
    return this.timings;
  }

  get current() {
    return this.lastNode;
  }
}
