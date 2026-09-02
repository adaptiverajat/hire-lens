import { NextResponse } from 'next/server';
import { requireOwnedCandidate, withAuth } from '@/lib/api/handler';
import { runResumeIntake } from '@/lib/graphs/intake';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Params = { params: Promise<{ candidateId: string }> };

/**
 * POST /api/candidates/:candidateId/parse
 * Runs the resume intake LangGraph workflow: Resume Agent -> normalise skills ->
 * persist -> index for retrieval.
 */
export const POST = withAuth(async (ctx, _request: Request, { params }: Params) => {
  const { candidateId } = await params;
  await requireOwnedCandidate(ctx, candidateId, 'id, job_id');

  const result = await runResumeIntake({ userId: ctx.userId, candidateId });

  return NextResponse.json({
    parse_status: 'complete',
    run_id: result.runId,
    structured: result.extraction,
    skills: result.skills,
  });
});
