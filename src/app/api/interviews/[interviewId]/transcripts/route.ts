import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, parseBody, requireOwnedInterview, withAuth } from '@/lib/api/handler';
import { parseTranscript } from '@/lib/documents/transcript';

export const runtime = 'nodejs';

type Params = { params: Promise<{ interviewId: string }> };

const createTranscriptSchema = z.object({
  raw_text: z.string().min(50, 'Transcript must be at least 50 characters'),
  source: z.enum(['teams', 'zoom', 'meet', 'manual', 'upload']).default('manual'),
  source_file_name: z.string().max(255).nullish(),
  source_file_path: z.string().max(500).nullish(),
});

/** GET /api/interviews/:interviewId/transcripts */
export const GET = withAuth(async (ctx, _request: Request, { params }: Params) => {
  const { interviewId } = await params;
  await requireOwnedInterview(ctx, interviewId);

  const { data, error } = await ctx.db
    .from('transcripts')
    .select('*')
    .eq('interview_id', interviewId)
    .order('created_at', { ascending: false });

  if (error) throw new ApiError(500, error.message);
  return NextResponse.json(data ?? []);
});

/**
 * POST /api/interviews/:interviewId/transcripts
 * Accepts a Teams VTT export or pasted text, splits it into speaker turns and
 * stores it. Evaluation is a separate call.
 */
export const POST = withAuth(async (ctx, request: Request, { params }: Params) => {
  const { interviewId } = await params;
  const interview = await requireOwnedInterview(ctx, interviewId);
  const body = await parseBody(request, createTranscriptSchema);

  const parsed = parseTranscript(body.raw_text);

  const { data, error } = await ctx.db
    .from('transcripts')
    .insert({
      interview_id: interviewId,
      source: body.source,
      raw_text: parsed.normalisedText,
      turns: parsed.turns,
      participants: parsed.participants,
      word_count: parsed.wordCount,
      source_file_name: body.source_file_name ?? null,
      source_file_path: body.source_file_path ?? null,
      created_by: ctx.userId,
    })
    .select('*')
    .single();

  if (error) throw new ApiError(500, error.message);

  // Recording a transcript means the interview happened.
  await ctx.db.from('interviews').update({ status: 'completed' }).eq('id', interviewId);

  return NextResponse.json(
    { ...data, candidate_id: interview.candidate_id },
    { status: 201 }
  );
});
