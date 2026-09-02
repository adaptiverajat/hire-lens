import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { runJdAgent, type JdAgentResult } from '@/lib/agents/jd-agent';
import { runResumeAgent, type ResumeAgentResult } from '@/lib/agents/resume-agent';
import { candidateEmbeddingText, jobEmbeddingText } from '@/lib/domain/format';
import { indexDocument } from '@/lib/ai/vector-store';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { ApiError, notFound } from '@/lib/api/handler';
import { finishRun, NodeTimer, startRun } from '@/lib/graphs/run-log';

/**
 * Document intake workflows (Features 1 + 2).
 *
 *   extract -> persist -> index
 *
 * Both graphs mark the row as `processing` on entry and `complete`/`failed` on
 * exit so the UI can poll parse status.
 */

// --- JD intake ---------------------------------------------------------------

const JdState = Annotation.Root({
  userId: Annotation<string>(),
  jobId: Annotation<string>(),
  runId: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  title: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  description: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  result: Annotation<JdAgentResult | null>({ reducer: (_, b) => b, default: () => null }),
  chunks: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
});

const jdGraph = new StateGraph(JdState)
  .addNode('load', async (state) => {
    const db = createSupabaseAdminClient();

    const { data } = await db
      .from('jobs')
      .select('id, title, description_raw')
      .eq('id', state.jobId)
      .eq('created_by', state.userId)
      .maybeSingle();

    if (!data) throw notFound('Job');
    if (!data.description_raw?.trim()) {
      throw new ApiError(422, 'Job has no description text to parse.');
    }

    await db.from('jobs').update({ parse_status: 'processing', parse_error: null }).eq('id', state.jobId);

    return { title: data.title as string, description: data.description_raw as string };
  })

  .addNode('extract', async (state) => ({
    result: await runJdAgent({ title: state.title, description: state.description }),
  }))

  .addNode('persist', async (state) => {
    const { extraction, skillRows } = state.result!;
    const db = createSupabaseAdminClient();

    // Use the JD Agent's extracted title if the current title is a generic
    // fallback (first line of the JD, "Untitled role", or empty).
    const GENERIC_TITLE_PATTERNS = [
      /^(job description|about the role|we are hiring|about us|position|opportunity)\b/i,
      /^untitled role$/i,
    ];
    const currentTitle = state.title?.trim() ?? '';
    const isGenericTitle =
      !currentTitle ||
      GENERIC_TITLE_PATTERNS.some((p) => p.test(currentTitle)) ||
      currentTitle.length < 3;

    const update: Record<string, unknown> = {
      structured: extraction,
      seniority: extraction.seniority,
      location: extraction.location,
      employment_type: extraction.employment_type,
      min_years_experience: extraction.min_years_experience,
      max_years_experience: extraction.max_years_experience,
      parse_status: 'complete',
      parse_error: null,
    };

    if (isGenericTitle && extraction.title?.trim()) {
      update.title = extraction.title.trim();
    }

    const { error: jobError } = await db
      .from('jobs')
      .update(update)
      .eq('id', state.jobId);

    if (jobError) throw new ApiError(500, `Failed to save JD analysis: ${jobError.message}`);

    // Replace so re-parsing never leaves stale requirements behind.
    await db.from('job_skills').delete().eq('job_id', state.jobId);

    if (skillRows.length > 0) {
      const { error } = await db
        .from('job_skills')
        .insert(skillRows.map((row) => ({ ...row, job_id: state.jobId })));
      if (error) throw new ApiError(500, `Failed to save job skills: ${error.message}`);
    }

    return {};
  })

  .addNode('index', async (state) => {
    const { extraction } = state.result!;

    const chunks = await indexDocument({
      ownerType: 'job',
      ownerId: state.jobId,
      userId: state.userId,
      jobId: state.jobId,
      content: jobEmbeddingText(state.title, extraction, state.description),
      metadata: { title: state.title, kind: 'job_description' },
    });

    return { chunks };
  })

  .addEdge(START, 'load')
  .addEdge('load', 'extract')
  .addEdge('extract', 'persist')
  .addEdge('persist', 'index')
  .addEdge('index', END);

export const jdIntakeGraph = jdGraph.compile();

export async function runJdIntake(input: { userId: string; jobId: string }) {
  const timer = new NodeTimer();
  const runId = await startRun({
    workflow: 'jd_intake',
    userId: input.userId,
    jobId: input.jobId,
  });

  try {
    const result = await timer.track('jd_intake', () =>
      jdIntakeGraph.invoke({ ...input, runId }, { runName: 'JD Intake', recursionLimit: 15 })
    );

    await finishRun(runId, {
      status: 'complete',
      currentNode: 'index',
      nodeTimings: timer.results,
      output: {
        requirements: result.result?.skillRows.length ?? 0,
        chunks_indexed: result.chunks,
      },
    });

    return { extraction: result.result?.extraction ?? null, requirements: result.result?.skillRows ?? [], runId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await createSupabaseAdminClient()
      .from('jobs')
      .update({ parse_status: 'failed', parse_error: message })
      .eq('id', input.jobId);

    await finishRun(runId, {
      status: 'failed',
      currentNode: timer.current,
      nodeTimings: timer.results,
      error: message,
    });
    throw error;
  }
}

// --- Resume intake -----------------------------------------------------------

const ResumeState = Annotation.Root({
  userId: Annotation<string>(),
  candidateId: Annotation<string>(),
  runId: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  jobId: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  resume: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  result: Annotation<ResumeAgentResult | null>({ reducer: (_, b) => b, default: () => null }),
  chunks: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
});

const resumeGraph = new StateGraph(ResumeState)
  .addNode('load', async (state) => {
    const db = createSupabaseAdminClient();

    const { data } = await db
      .from('candidates')
      .select('id, job_id, resume_raw, jobs!inner(created_by)')
      .eq('id', state.candidateId)
      .eq('jobs.created_by', state.userId)
      .maybeSingle();

    if (!data) throw notFound('Candidate');
    if (!data.resume_raw?.trim()) {
      throw new ApiError(422, 'Candidate has no resume text to parse.');
    }

    await db
      .from('candidates')
      .update({ parse_status: 'processing', parse_error: null })
      .eq('id', state.candidateId);

    return { jobId: data.job_id as string, resume: data.resume_raw as string };
  })

  .addNode('extract', async (state) => ({
    result: await runResumeAgent({ resume: state.resume }),
  }))

  .addNode('persist', async (state) => {
    const { extraction, skillRows } = state.result!;
    const db = createSupabaseAdminClient();

    const { error: candidateError } = await db
      .from('candidates')
      .update({
        structured: extraction,
        // Only fill contact details the recruiter left blank - never clobber
        // a value a human typed in.
        full_name: extraction.full_name || undefined,
        headline: extraction.headline,
        location: extraction.location,
        total_years_experience: extraction.total_years_experience,
        parse_status: 'complete',
        parse_error: null,
      })
      .eq('id', state.candidateId);

    if (candidateError) {
      throw new ApiError(500, `Failed to save resume analysis: ${candidateError.message}`);
    }

    await db.from('candidate_skills').delete().eq('candidate_id', state.candidateId);

    if (skillRows.length > 0) {
      const { error } = await db
        .from('candidate_skills')
        .insert(skillRows.map((row) => ({ ...row, candidate_id: state.candidateId })));
      if (error) throw new ApiError(500, `Failed to save candidate skills: ${error.message}`);
    }

    return {};
  })

  .addNode('index', async (state) => {
    const { extraction } = state.result!;

    const chunks = await indexDocument({
      ownerType: 'candidate',
      ownerId: state.candidateId,
      userId: state.userId,
      jobId: state.jobId,
      candidateId: state.candidateId,
      content: candidateEmbeddingText(extraction.full_name, extraction, state.resume),
      metadata: { title: extraction.full_name, kind: 'resume' },
    });

    return { chunks };
  })

  .addEdge(START, 'load')
  .addEdge('load', 'extract')
  .addEdge('extract', 'persist')
  .addEdge('persist', 'index')
  .addEdge('index', END);

export const resumeIntakeGraph = resumeGraph.compile();

export async function runResumeIntake(input: { userId: string; candidateId: string }) {
  const timer = new NodeTimer();
  const runId = await startRun({
    workflow: 'resume_intake',
    userId: input.userId,
    candidateId: input.candidateId,
  });

  try {
    const result = await timer.track('resume_intake', () =>
      resumeIntakeGraph.invoke({ ...input, runId }, { runName: 'Resume Intake', recursionLimit: 15 })
    );

    await finishRun(runId, {
      status: 'complete',
      currentNode: 'index',
      nodeTimings: timer.results,
      output: {
        skills: result.result?.skillRows.length ?? 0,
        chunks_indexed: result.chunks,
      },
    });

    return {
      extraction: result.result?.extraction ?? null,
      skills: result.result?.skillRows ?? [],
      runId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await createSupabaseAdminClient()
      .from('candidates')
      .update({ parse_status: 'failed', parse_error: message })
      .eq('id', input.candidateId);

    await finishRun(runId, {
      status: 'failed',
      currentNode: timer.current,
      nodeTimings: timer.results,
      error: message,
    });
    throw error;
  }
}
