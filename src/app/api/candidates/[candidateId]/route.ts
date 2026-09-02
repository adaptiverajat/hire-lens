import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, parseBody, requireOwnedCandidate, withAuth } from '@/lib/api/handler';
import { deleteDocumentVectors } from '@/lib/ai/vector-store';

export const runtime = 'nodejs';

type Params = { params: Promise<{ candidateId: string }> };

const updateCandidateSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  email: z.string().email().nullish(),
  phone: z.string().max(50).nullish(),
  location: z.string().max(120).nullish(),
  headline: z.string().max(300).nullish(),
  resume_raw: z.string().min(50).optional(),
  status: z
    .enum(['new', 'screening', 'interviewing', 'offer', 'hired', 'rejected', 'on_hold'])
    .optional(),
});

/** GET /api/candidates/:candidateId - full dossier for the candidate view. */
export const GET = withAuth(async (ctx, _request: Request, { params }: Params) => {
  const { candidateId } = await params;
  const candidate = await requireOwnedCandidate(ctx, candidateId);

  const [skills, analysis, questionSets, interviews, evaluations, flags, feedback, job] =
    await Promise.all([
      ctx.db
        .from('candidate_skills')
        .select('id, skill, raw_label, category, proficiency, years, evidence')
        .eq('candidate_id', candidateId),
      ctx.db
        .from('match_analyses')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      ctx.db
        .from('question_sets')
        .select('id, label, notes, created_at, questions(*)')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false }),
      ctx.db
        .from('interviews')
        .select('id, round, stage, status, scheduled_at, interviewer_name, created_at, transcripts(id, created_at, word_count, participants)')
        .eq('candidate_id', candidateId)
        .order('round'),
      ctx.db
        .from('evaluations')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false }),
      ctx.db
        .from('flags')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false }),
      ctx.db
        .from('feedback')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false }),
      ctx.db
        .from('jobs')
        .select('id, title, seniority, status, structured')
        .eq('id', String(candidate.job_id))
        .single(),
    ]);

  return NextResponse.json({
    ...candidate,
    job: job.data ?? null,
    skills: skills.data ?? [],
    match_analysis: analysis.data ?? null,
    question_sets: questionSets.data ?? [],
    interviews: interviews.data ?? [],
    evaluations: evaluations.data ?? [],
    flags: flags.data ?? [],
    feedback: feedback.data ?? [],
  });
});

/** PATCH /api/candidates/:candidateId */
export const PATCH = withAuth(async (ctx, request: Request, { params }: Params) => {
  const { candidateId } = await params;
  await requireOwnedCandidate(ctx, candidateId, 'id, job_id');

  const body = await parseBody(request, updateCandidateSchema);
  const update: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) update[key] = value;
  }

  // Replacing the resume text invalidates the extracted profile.
  if (typeof update.resume_raw === 'string') {
    update.parse_status = 'pending';
    update.structured = null;
  }

  if (Object.keys(update).length === 0) throw new ApiError(400, 'No fields to update');

  const { data, error } = await ctx.db
    .from('candidates')
    .update(update)
    .eq('id', candidateId)
    .select('*')
    .single();

  if (error) throw new ApiError(500, error.message);
  return NextResponse.json(data);
});

/** DELETE /api/candidates/:candidateId */
export const DELETE = withAuth(async (ctx, _request: Request, { params }: Params) => {
  const { candidateId } = await params;
  await requireOwnedCandidate(ctx, candidateId, 'id, job_id');

  await deleteDocumentVectors('candidate', candidateId);

  const { error } = await ctx.db.from('candidates').delete().eq('id', candidateId);
  if (error) throw new ApiError(500, error.message);

  return NextResponse.json({ deleted: true });
});
