import { NextResponse } from 'next/server';
import { ApiError, withAuth } from '@/lib/api/handler';

export const runtime = 'nodejs';

/**
 * GET /api/flags - the human review queue.
 * Query params: status (default "open"), level, jobId.
 */
export const GET = withAuth(async (ctx, request: Request) => {
  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? 'open';
  const level = url.searchParams.get('level');
  const jobId = url.searchParams.get('jobId');

  // Scope to the caller's jobs first; flags carry no owner column of their own.
  const { data: jobs } = await ctx.db.from('jobs').select('id, title').eq('created_by', ctx.userId);

  const jobIds = (jobs ?? []).map((j) => j.id);
  if (jobIds.length === 0) return NextResponse.json([]);

  const jobTitles = new Map((jobs ?? []).map((j) => [j.id, j.title as string]));

  let query = ctx.db
    .from('flags')
    .select('*, candidates(id, full_name, status)')
    .in('job_id', jobId && jobIds.includes(jobId) ? [jobId] : jobIds)
    .order('created_at', { ascending: false });

  if (status !== 'all') query = query.eq('status', status);
  if (level) query = query.eq('level', level);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);

  return NextResponse.json(
    (data ?? []).map((flag) => ({
      ...flag,
      job_title: jobTitles.get(flag.job_id) ?? null,
    }))
  );
});
