import { NextResponse } from 'next/server';
import { ApiError, requireOwnedCandidate, withAuth } from '@/lib/api/handler';
import { runCandidateAnalysis } from '@/lib/graphs/candidate-analysis';

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

  const result = await runCandidateAnalysis({
    userId: ctx.userId,
    jobId: String(candidate.job_id),
    candidateId,
  });

  return NextResponse.json({
    run_id: result.runId,
    match_analysis_id: result.matchAnalysisId,
    question_set_id: result.questionSetId,
    match_score: result.gap?.match_score ?? null,
    coverage_score: result.coverageScore,
    evidence_used: result.evidenceCount,
    analysis: result.gap,
  });
});
