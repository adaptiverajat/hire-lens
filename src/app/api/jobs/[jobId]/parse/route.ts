import { NextResponse } from 'next/server';
import { requireOwnedJob, withAuth } from '@/lib/api/handler';
import { runJdIntake } from '@/lib/graphs/intake';
import { withTokenUsage } from '@/lib/ai/token-usage';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Params = { params: Promise<{ jobId: string }> };

/**
 * POST /api/jobs/:jobId/parse
 * Runs the JD intake LangGraph workflow: JD Agent -> persist requirements ->
 * index for retrieval. Skips the LLM call if the JD was already parsed
 * successfully and the description hasn't changed.
 */
export const POST = withAuth(async (ctx, _request: Request, { params }: Params) => {
  const { jobId } = await params;
  const job = await requireOwnedJob(ctx, jobId, 'id, description_raw, structured, parse_status');

  // Cache hit: already parsed and description unchanged — return cached result.
  if (job.parse_status === 'complete' && job.structured) {
    const db = createSupabaseAdminClient();
    const { data: skills } = await db
      .from('job_skills')
      .select('skill, raw_label, category, importance, is_required, min_years')
      .eq('job_id', jobId);
    return NextResponse.json({
      parse_status: 'complete',
      run_id: null,
      structured: job.structured,
      requirements: skills ?? [],
      token_usage: {},
      cached: true,
    });
  }

  const { result, usage } = await withTokenUsage(() =>
    runJdIntake({ userId: ctx.userId, jobId }),
  );

  // Persist token usage into the agent run's output.
  if (result.runId && Object.keys(usage).length > 0) {
    await createSupabaseAdminClient()
      .from('agent_runs')
      .update({ output: { token_usage: usage } })
      .eq('id', result.runId);
  }

  return NextResponse.json({
    parse_status: 'complete',
    run_id: result.runId,
    structured: result.extraction,
    requirements: result.requirements,
    token_usage: usage,
  });
});
