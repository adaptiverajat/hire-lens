import { NextResponse } from 'next/server';
import { requireOwnedTranscript, withAuth } from '@/lib/api/handler';
import { runTranscriptReview } from '@/lib/graphs/transcript-review';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Params = { params: Promise<{ transcriptId: string }> };

/**
 * POST /api/transcripts/:transcriptId/evaluate
 * Runs the transcript review LangGraph workflow: Evidence Retrieval ->
 * Transcript Evaluation -> Red Flag -> Human Review synthesis.
 *
 * Produces a recommendation only. No candidate is ever auto-rejected.
 */
export const POST = withAuth(async (ctx, _request: Request, { params }: Params) => {
  const { transcriptId } = await params;
  await requireOwnedTranscript(ctx, transcriptId);

  const result = await runTranscriptReview({ userId: ctx.userId, transcriptId });

  return NextResponse.json({
    run_id: result.runId,
    evaluation_id: result.evaluationId,
    evaluation: result.evaluation,
    red_flags: result.redFlags,
    review: result.review,
    flag_ids: result.flagIds,
  });
});
