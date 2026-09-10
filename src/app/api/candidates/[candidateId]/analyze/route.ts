import { NextResponse } from 'next/server';
import { ApiError, requireOwnedCandidate, withAuth } from '@/lib/api/handler';
import { runOrchestratedWorkflow } from '@/lib/orchestration/orchestrator';
import { withTokenUsage } from '@/lib/ai/token-usage';
import { mergeRunOutput } from '@/lib/graphs/run-log';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Params = { params: Promise<{ candidateId: string }> };

/**
 * POST /api/candidates/:candidateId/analyze
 * Runs the candidate analysis LangGraph workflow: Evidence Retrieval ->
 * Gap Analysis -> Question Agent, persisting the match analysis and question set.
 */
export const POST = withAuth(async (ctx, _request: Request, { params }: Params) => {
  const { candidateId } = await params;
  const candidate = await requireOwnedCandidate(ctx, candidateId, 'id, job_id, parse_status');

  if (candidate.parse_status !== 'complete') {
    throw new ApiError(
      422,
      'Parse the resume before running analysis (POST /api/candidates/:id/parse).'
    );
  }

  const { result, usage } = await withTokenUsage(() =>
    runOrchestratedWorkflow({
      workflow: 'candidate_analysis',
      userId: ctx.userId,
      jobId: String(candidate.job_id),
      candidateId,
    }),
  );

  // Persist token usage into the agent run's output.
  if (result.runId && Object.keys(usage).length > 0) {
    await mergeRunOutput(result.runId, { token_usage: usage });
  }

  return NextResponse.json({
    run_id: result.runId,
    match_analysis_id: result.matchAnalysisId,
    question_set_id: result.questionSetId,
    match_score: result.gap?.match_score ?? null,
    coverage_score: result.coverageScore,
    evidence_used: result.evidenceCount,
    analysis: result.gap,
    token_usage: usage,
  });
});
