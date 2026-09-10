import { createSupabaseAdminClient } from '@/lib/supabase/server';

/**
 * Shared Agent Memory.
 *
 * A persistent, cross-run calibration store that agents read from before
 * running and write to after validation failures, reviewer overrides, or
 * post-hire outcomes. Unlike the vector store (RAG over historical cases),
 * agent_memory stores agent-scoped learnings that adjust behavior directly.
 */

export type AgentName =
  | 'JD Agent'
  | 'Resume Agent'
  | 'Evidence Retrieval Agent'
  | 'Gap Analysis Agent'
  | 'Question Agent'
  | 'Transcript Evaluation Agent'
  | 'Red Flag Agent'
  | 'Human Review Agent';

export type NoteType = 'calibration' | 'bias_warning' | 'outcome' | 'insight';

export type MemorySource =
  | 'reviewer_override'
  | 'validation_failure'
  | 'post_hire_outcome'
  | 'agent_insight'
  | 'cross_agent';

export interface AgentMemoryNote {
  id: string;
  agent_name: AgentName;
  note_type: NoteType;
  content: string;
  confidence: number;
  source: MemorySource;
  job_id: string | null;
  candidate_id: string | null;
  run_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface WriteMemoryInput {
  agentName: AgentName;
  noteType: NoteType;
  content: string;
  source: MemorySource;
  confidence?: number;
  jobId?: string | null;
  candidateId?: string | null;
  runId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Write a calibration note to agent memory.
 * Failures are logged but never throw — memory is an enhancement, not a dependency.
 */
export async function writeAgentMemory(input: WriteMemoryInput): Promise<string | null> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from('agent_memory')
      .insert({
        agent_name: input.agentName,
        note_type: input.noteType,
        content: input.content,
        confidence: input.confidence ?? 1,
        source: input.source,
        job_id: input.jobId ?? null,
        candidate_id: input.candidateId ?? null,
        run_id: input.runId ?? null,
        metadata: input.metadata ?? {},
      })
      .select('id')
      .maybeSingle();

    if (error) throw error;
    return data?.id ?? null;
  } catch (error) {
    console.error('[agent-memory] failed to write note', error);
    return null;
  }
}

/**
 * Retrieve calibration notes for a specific agent.
 * Returns notes sorted by recency, limited to `limit` (default 8).
 * Optionally filter by note type.
 */
export async function readAgentMemory(params: {
  agentName: AgentName;
  noteTypes?: NoteType[];
  jobId?: string | null;
  limit?: number;
}): Promise<AgentMemoryNote[]> {
  try {
    let query = createSupabaseAdminClient()
      .from('agent_memory')
      .select('id, agent_name, note_type, content, confidence, source, job_id, candidate_id, run_id, metadata, created_at')
      .eq('agent_name', params.agentName)
      .order('created_at', { ascending: false })
      .limit(params.limit ?? 8);

    if (params.noteTypes && params.noteTypes.length > 0) {
      query = query.in('note_type', params.noteTypes);
    }

    if (params.jobId) {
      query = query.or(`job_id.eq.${params.jobId},job_id.is.null`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as AgentMemoryNote[];
  } catch (error) {
    console.error('[agent-memory] failed to read notes', error);
    return [];
  }
}

/**
 * Format agent memory notes for injection into a prompt.
 * Returns a string suitable for a {calibrationNotes} template placeholder.
 */
export function formatAgentMemory(notes: AgentMemoryNote[]): string {
  if (notes.length === 0) {
    return '';
  }

  return notes
    .map((note, i) => {
      const confidence = Math.round(note.confidence * 100);
      const age = Math.round((Date.now() - new Date(note.created_at).getTime()) / 86400000);
      return `Note ${i + 1} (${note.note_type}, ${confidence}% confidence, ${ageLabel(age)}): ${note.content}`;
    })
    .join('\n');
}

function ageLabel(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

/**
 * Convenience: read + format in one call for prompt injection.
 */
export async function getCalibrationNotes(params: {
  agentName: AgentName;
  noteTypes?: NoteType[];
  jobId?: string | null;
  limit?: number;
}): Promise<string> {
  const notes = await readAgentMemory(params);
  return formatAgentMemory(notes);
}
