import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, parseBody, requireOwnedCandidate, withAuth } from '@/lib/api/handler';

export const runtime = 'nodejs';

type Params = { params: Promise<{ candidateId: string }> };

const createInterviewSchema = z.object({
  stage: z
    .enum(['screening', 'technical', 'system_design', 'behavioural', 'final'])
    .default('technical'),
  round: z.number().int().positive().max(20).default(1),
  interviewer_name: z.string().max(200).nullish(),
  scheduled_at: z.string().datetime({ offset: true }).nullish(),
  question_set_id: z.string().uuid().nullish(),
});

/** GET /api/candidates/:candidateId/interviews */
export const GET = withAuth(async (ctx, _request: Request, { params }: Params) => {
  const { candidateId } = await params;
  await requireOwnedCandidate(ctx, candidateId, 'id, job_id');

  const { data, error } = await ctx.db
    .from('interviews')
    .select('*, transcripts(id, created_at, word_count, participants, source)')
    .eq('candidate_id', candidateId)
    .order('round');

  if (error) throw new ApiError(500, error.message);
  return NextResponse.json(data ?? []);
});

/** POST /api/candidates/:candidateId/interviews */
export const POST = withAuth(async (ctx, request: Request, { params }: Params) => {
  const { candidateId } = await params;
  const candidate = await requireOwnedCandidate(ctx, candidateId, 'id, job_id');
  const body = await parseBody(request, createInterviewSchema);

  // If no question set was named, attach the most recent one for this candidate
  // so transcript evaluation has expected signals to grade against.
  let questionSetId = body.question_set_id ?? null;
  if (!questionSetId) {
    const { data } = await ctx.db
      .from('question_sets')
      .select('id')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    questionSetId = data?.id ?? null;
  }

  const { data, error } = await ctx.db
    .from('interviews')
    .insert({
      job_id: String(candidate.job_id),
      candidate_id: candidateId,
      question_set_id: questionSetId,
      stage: body.stage,
      round: body.round,
      interviewer_name: body.interviewer_name ?? null,
      interviewer_id: ctx.userId,
      scheduled_at: body.scheduled_at ?? null,
      created_by: ctx.userId,
    })
    .select('*')
    .single();

  if (error) throw new ApiError(500, error.message);
  return NextResponse.json(data, { status: 201 });
});
