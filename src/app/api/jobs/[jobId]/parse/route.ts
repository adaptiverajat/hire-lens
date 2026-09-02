import { NextResponse } from 'next/server';
import { requireOwnedJob, withAuth } from '@/lib/api/handler';
import { runJdIntake } from '@/lib/graphs/intake';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Params = { params: Promise<{ jobId: string }> };

/**
 * POST /api/jobs/:jobId/parse
 * Runs the JD intake LangGraph workflow: JD Agent -> persist requirements ->
 * index for retrieval.
 */
export const POST = withAuth(async (ctx, _request: Request, { params }: Params) => {
  const { jobId } = await params;
  await requireOwnedJob(ctx, jobId, 'id');

  const result = await runJdIntake({ userId: ctx.userId, jobId });

  return NextResponse.json({
    parse_status: 'complete',
    run_id: result.runId,
    structured: result.extraction,
    requirements: result.requirements,
  });
});
