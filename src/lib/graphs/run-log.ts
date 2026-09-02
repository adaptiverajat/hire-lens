import { createSupabaseAdminClient } from '@/lib/supabase/server';

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
