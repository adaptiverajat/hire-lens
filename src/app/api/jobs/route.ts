import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, parseBody, withAuth } from '@/lib/api/handler';

export const runtime = 'nodejs';

const createJobSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description_raw: z.string().min(50, 'Job description must be at least 50 characters'),
  department: z.string().max(120).nullish(),
  location: z.string().max(120).nullish(),
  deadline_date: z.string().datetime({ offset: true }).nullish(),
  status: z.enum(['draft', 'open', 'on_hold', 'closed']).default('open'),
  priority: z.enum(['normal', 'urgent']).default('normal'),
  source_file_name: z.string().max(255).nullish(),
  source_file_path: z.string().max(500).nullish(),
});

/** GET /api/jobs - list the caller's jobs with candidate counts. */
export const GET = withAuth(async (ctx) => {
  const { data: jobs, error } = await ctx.db
    .from('jobs')
    .select(
      'id, title, department, location, status, seniority, parse_status, parse_error, opened_at, deadline_date, structured, created_at, updated_at'
    )
    .eq('created_by', ctx.userId)
    .order('created_at', { ascending: false });

  if (error) throw new ApiError(500, error.message);

  const ids = (jobs ?? []).map((j) => j.id);
  const counts = new Map<string, number>();

  if (ids.length > 0) {
    // One query for all counts rather than N round-trips.
    const { data: candidates } = await ctx.db
      .from('candidates')
      .select('job_id')
      .in('job_id', ids);

    for (const row of candidates ?? []) {
      counts.set(row.job_id, (counts.get(row.job_id) ?? 0) + 1);
    }
  }

  return NextResponse.json(
    (jobs ?? []).map((job) => ({
      ...job,
      candidate_count: counts.get(job.id) ?? 0,
    }))
  );
});

/**
 * POST /api/jobs - create a job.
 * The JD Agent runs separately via POST /api/jobs/:id/parse so creation stays
 * fast and a model failure never loses the recruiter's text.
 */
export const POST = withAuth(async (ctx, request: Request) => {
  const body = await parseBody(request, createJobSchema);

  const { data, error } = await ctx.db
    .from('jobs')
    .insert({
      title: body.title,
      description_raw: body.description_raw,
      department: body.department ?? null,
      location: body.location ?? null,
      deadline_date: body.deadline_date ?? null,
      status: body.status,
      priority: body.priority,
      source_file_name: body.source_file_name ?? null,
      source_file_path: body.source_file_path ?? null,
      parse_status: 'pending',
      created_by: ctx.userId,
    })
    .select('*')
    .single();

  if (error) throw new ApiError(500, error.message);
  return NextResponse.json(data, { status: 201 });
});
