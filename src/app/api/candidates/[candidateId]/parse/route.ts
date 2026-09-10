import { NextResponse } from 'next/server';
import { requireOwnedCandidate, withAuth } from '@/lib/api/handler';
import { runOrchestratedWorkflow } from '@/lib/orchestration/orchestrator';
import { withTokenUsage } from '@/lib/ai/token-usage';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { mergeRunOutput } from '@/lib/graphs/run-log';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Params = { params: Promise<{ candidateId: string }> };

/**
 * POST /api/candidates/:candidateId/parse
 * Runs the resume intake LangGraph workflow: Resume Agent -> normalise skills ->
 * persist -> index for retrieval. Skips the LLM call if the resume was already
 * parsed successfully and the resume text hasn't changed.
 */
export const POST = withAuth(async (ctx, _request: Request, { params }: Params) => {
  const { candidateId } = await params;
  const candidate = await requireOwnedCandidate(ctx, candidateId, 'id, job_id, resume_raw, structured, parse_status');

  // Cache hit: already parsed and resume unchanged — return cached result.
  if (candidate.parse_status === 'complete' && candidate.structured) {
    const db = createSupabaseAdminClient();
    const { data: skills } = await db
      .from('candidate_skills')
      .select('skill, raw_label, category, proficiency, years, evidence')
      .eq('candidate_id', candidateId);
    return NextResponse.json({
      parse_status: 'complete',
      run_id: null,
      structured: candidate.structured,
      skills: skills ?? [],
      token_usage: {},
      cached: true,
    });
  }

  const { result, usage } = await withTokenUsage(() =>
    runOrchestratedWorkflow({ workflow: 'resume_intake', userId: ctx.userId, candidateId }),
  );

  // Persist token usage into the agent run's output.
  if (result.runId && Object.keys(usage).length > 0) {
    await mergeRunOutput(result.runId, { token_usage: usage });
  }

  return NextResponse.json({
    parse_status: 'complete',
    run_id: result.runId,
    structured: result.extraction,
    skills: result.skills,
    token_usage: usage,
  });
});
