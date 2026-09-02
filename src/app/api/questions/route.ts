import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, parseBody, requireOwnedJob, withAuth } from '@/lib/api/handler';

export const runtime = 'nodejs';

const createQuestionSchema = z.object({
  job_id: z.string().uuid(),
  candidate_id: z.string().uuid().nullish(),
  question_set_id: z.string().uuid().nullish(),
  category: z.enum(['screening', 'deep_technical', 'gap_validation', 'experience_validation']),
  question: z.string().min(5),
  rationale: z.string().nullish(),
  expected_signals: z.array(z.string()).default([]),
  target_skill: z.string().max(120).nullish(),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullish(),
});

/**
 * GET /api/questions - the reusable question library.
 * Query params: jobId, category, search, limit.
 */
export const GET = withAuth(async (ctx, request: Request) => {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');
  const category = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 300);

  const { data: jobs } = await ctx.db.from('jobs').select('id, title').eq('created_by', ctx.userId);
  const jobIds = (jobs ?? []).map((j) => j.id);
  if (jobIds.length === 0) return NextResponse.json([]);

  const jobTitles = new Map((jobs ?? []).map((j) => [j.id, j.title as string]));

  let query = ctx.db
    .from('questions')
    .select('*, candidates(full_name)')
    .in('job_id', jobId && jobIds.includes(jobId) ? [jobId] : jobIds)
    .eq('is_reusable', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (category && category !== 'all') query = query.eq('category', category);
  if (search) query = query.ilike('question', `%${search}%`);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);

  return NextResponse.json(
    (data ?? []).map((q) => ({ ...q, job_title: jobTitles.get(q.job_id) ?? null }))
  );
});

/** POST /api/questions - add a recruiter-authored question. */
export const POST = withAuth(async (ctx, request: Request) => {
  const body = await parseBody(request, createQuestionSchema);
  await requireOwnedJob(ctx, body.job_id, 'id');

  const { data, error } = await ctx.db
    .from('questions')
    .insert({
      job_id: body.job_id,
      candidate_id: body.candidate_id ?? null,
      question_set_id: body.question_set_id ?? null,
      category: body.category,
      question: body.question,
      rationale: body.rationale ?? null,
      expected_signals: body.expected_signals,
      target_skill: body.target_skill ?? null,
      difficulty: body.difficulty ?? null,
      source: 'recruiter',
      created_by: ctx.userId,
    })
    .select('*')
    .single();

  if (error) throw new ApiError(500, error.message);
  return NextResponse.json(data, { status: 201 });
});
