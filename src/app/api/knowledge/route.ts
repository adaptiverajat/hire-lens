import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, parseBody, withAuth } from '@/lib/api/handler';
import { indexDocument } from '@/lib/ai/vector-store';

export const runtime = 'nodejs';
export const maxDuration = 120;

const createEntrySchema = z.object({
  kind: z
    .enum([
      'approved_candidate',
      'rejected_candidate',
      'override',
      'interview_assessment',
      'historical_case',
      'recruiter_note',
    ])
    .default('recruiter_note'),
  title: z.string().min(1).max(300),
  content: z.string().min(20, 'Add enough detail to be useful later'),
  job_id: z.string().uuid().nullish(),
  candidate_id: z.string().uuid().nullish(),
  outcome: z.enum(['advance', 'hold', 'reject', 'hire']).nullish(),
});

/** GET /api/knowledge - browse the learning repository. */
export const GET = withAuth(async (ctx, request: Request) => {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);

  let query = ctx.db
    .from('knowledge_entries')
    .select('*, jobs(title), candidates(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (kind && kind !== 'all') query = query.eq('kind', kind);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);

  return NextResponse.json(data ?? []);
});

/** POST /api/knowledge - add a recruiter note and embed it for retrieval. */
export const POST = withAuth(async (ctx, request: Request) => {
  const body = await parseBody(request, createEntrySchema);

  const { data, error } = await ctx.db
    .from('knowledge_entries')
    .insert({
      kind: body.kind,
      title: body.title,
      content: body.content,
      job_id: body.job_id ?? null,
      candidate_id: body.candidate_id ?? null,
      outcome: body.outcome ?? null,
      metadata: { title: body.title, outcome: body.outcome ?? null, kind: body.kind },
      created_by: ctx.userId,
    })
    .select('*')
    .single();

  if (error) throw new ApiError(500, error.message);

  const chunks = await indexDocument({
    ownerType: 'knowledge_entry',
    ownerId: data.id as string,
    userId: ctx.userId,
    jobId: body.job_id ?? null,
    candidateId: body.candidate_id ?? null,
    content: `${body.title}\n\n${body.content}`,
    metadata: { title: body.title, outcome: body.outcome ?? null, kind: body.kind },
  });

  return NextResponse.json({ ...data, chunks_indexed: chunks }, { status: 201 });
});
