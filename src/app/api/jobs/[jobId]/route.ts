import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, parseBody, requireOwnedJob, withAuth } from '@/lib/api/handler';
import { deleteDocumentVectors } from '@/lib/ai/vector-store';

export const runtime = 'nodejs';

type Params = { params: Promise<{ jobId: string }> };

const updateJobSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description_raw: z.string().min(50).optional(),
  department: z.string().max(120).nullish(),
  location: z.string().max(120).nullish(),
  deadline_date: z.string().datetime({ offset: true }).nullish(),
  status: z.enum(['draft', 'open', 'on_hold', 'closed']).optional(),
  priority: z.enum(['normal', 'urgent']).optional(),
});

/** GET /api/jobs/:jobId - job with requirements and candidate summaries. */
export const GET = withAuth(async (ctx, _request: Request, { params }: Params) => {
  const { jobId } = await params;
  const job = await requireOwnedJob(ctx, jobId);

  const [skills, candidates] = await Promise.all([
    ctx.db
      .from('job_skills')
      .select('id, skill, raw_label, category, importance, is_required, min_years')
      .eq('job_id', jobId)
      .order('importance', { ascending: false }),
    ctx.db
      .from('candidates')
      .select('id, full_name, email, status, parse_status, total_years_experience, created_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false }),
  ]);

  const candidateIds = (candidates.data ?? []).map((c) => c.id);

  // Latest match score per candidate, for the candidate list on the job page.
  const scores = new Map<string, number>();
  if (candidateIds.length > 0) {
    const { data } = await ctx.db
      .from('match_analyses')
      .select('candidate_id, match_score, created_at')
      .in('candidate_id', candidateIds)
      .order('created_at', { ascending: false });

    for (const row of data ?? []) {
      if (!scores.has(row.candidate_id)) scores.set(row.candidate_id, row.match_score);
    }
  }

  return NextResponse.json({
    ...job,
    skills: skills.data ?? [],
    candidates: (candidates.data ?? []).map((c) => ({
      ...c,
      match_score: scores.get(c.id) ?? null,
    })),
  });
});

/** PATCH /api/jobs/:jobId */
export const PATCH = withAuth(async (ctx, request: Request, { params }: Params) => {
  const { jobId } = await params;
  await requireOwnedJob(ctx, jobId, 'id');

  const body = await parseBody(request, updateJobSchema);
  const update: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) update[key] = value;
  }

  // Editing the JD text invalidates the extracted requirements.
  if (typeof update.description_raw === 'string') {
    update.parse_status = 'pending';
    update.structured = null;
  }

  if (Object.keys(update).length === 0) {
    throw new ApiError(400, 'No fields to update');
  }

  const { data, error } = await ctx.db
    .from('jobs')
    .update(update)
    .eq('id', jobId)
    .eq('created_by', ctx.userId)
    .select('*')
    .single();

  if (error) throw new ApiError(500, error.message);
  return NextResponse.json(data);
});

/** DELETE /api/jobs/:jobId - cascades to candidates, interviews and evaluations. */
export const DELETE = withAuth(async (ctx, _request: Request, { params }: Params) => {
  const { jobId } = await params;
  await requireOwnedJob(ctx, jobId, 'id');

  await deleteDocumentVectors('job', jobId);

  const { error } = await ctx.db
    .from('jobs')
    .delete()
    .eq('id', jobId)
    .eq('created_by', ctx.userId);

  if (error) throw new ApiError(500, error.message);
  return NextResponse.json({ deleted: true });
});
