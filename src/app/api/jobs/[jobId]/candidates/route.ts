import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, parseBody, requireOwnedJob, withAuth } from '@/lib/api/handler';

export const runtime = 'nodejs';

type Params = { params: Promise<{ jobId: string }> };

const createCandidateSchema = z.object({
  full_name: z.string().min(1, 'Candidate name is required').max(200),
  email: z.string().email().nullish(),
  phone: z.string().max(50).nullish(),
  resume_raw: z.string().min(50, 'Resume text must be at least 50 characters'),
  source_file_name: z.string().max(255).nullish(),
  source_file_path: z.string().max(500).nullish(),
});

/** GET /api/jobs/:jobId/candidates */
export const GET = withAuth(async (ctx, _request: Request, { params }: Params) => {
  const { jobId } = await params;
  await requireOwnedJob(ctx, jobId, 'id');

  const { data, error } = await ctx.db
    .from('candidates')
    .select(
      'id, full_name, email, phone, location, headline, status, parse_status, parse_error, total_years_experience, created_at, updated_at'
    )
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) throw new ApiError(500, error.message);
  return NextResponse.json(data ?? []);
});

/** POST /api/jobs/:jobId/candidates - resume parsing runs via the parse endpoint. */
export const POST = withAuth(async (ctx, request: Request, { params }: Params) => {
  const { jobId } = await params;
  await requireOwnedJob(ctx, jobId, 'id');

  const body = await parseBody(request, createCandidateSchema);

  const { data, error } = await ctx.db
    .from('candidates')
    .insert({
      job_id: jobId,
      full_name: body.full_name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      resume_raw: body.resume_raw,
      source_file_name: body.source_file_name ?? null,
      source_file_path: body.source_file_path ?? null,
      parse_status: 'pending',
      status: 'new',
      created_by: ctx.userId,
    })
    .select('*')
    .single();

  if (error) throw new ApiError(500, error.message);
  return NextResponse.json(data, { status: 201 });
});
