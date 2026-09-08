import { NextResponse } from 'next/server';
import { requireOwnedTranscript, withAuth } from '@/lib/api/handler';
import { runTranscriptReview } from '@/lib/graphs/transcript-review';
import { withTokenUsage } from '@/lib/ai/token-usage';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

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
  const transcript = await requireOwnedTranscript(ctx, transcriptId);

  const { result, usage } = await withTokenUsage(() =>
    runTranscriptReview({ userId: ctx.userId, transcriptId, candidateId: transcript.candidate_id }),
  );

  // Persist token usage into the agent run's output.
  if (result.runId && Object.keys(usage).length > 0) {
    await createSupabaseAdminClient()
      .from('agent_runs')
      .update({ output: { token_usage: usage } })
      .eq('id', result.runId);
  }

  return NextResponse.json({
    run_id: result.runId,
    candidate_id: transcript.candidate_id,
    evaluation_id: result.evaluationId,
    evaluation: result.evaluation,
    red_flags: result.redFlags,
    review: result.review,
    flag_ids: result.flagIds,
    token_usage: usage,
  });
});
