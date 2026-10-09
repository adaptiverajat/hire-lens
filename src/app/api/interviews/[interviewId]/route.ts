import { NextResponse } from 'next/server';
import { ApiError, requireOwnedInterview, withAuth } from '@/lib/api/handler';

export const runtime = 'nodejs';

type Params = { params: Promise<{ interviewId: string }> };

/** DELETE /api/interviews/:interviewId */
export const DELETE = withAuth(async (ctx, _request: Request, { params }: Params) => {
  const { interviewId } = await params;
  await requireOwnedInterview(ctx, interviewId);

  const { data: evaluations, error: evaluationError } = await ctx.db
    .from('evaluations')
    .select('id')
    .eq('interview_id', interviewId);
  if (evaluationError) throw new ApiError(500, evaluationError.message);

  const evaluationIds = (evaluations ?? []).map((evaluation) => String(evaluation.id));
  if (evaluationIds.length > 0) {
    const { data: knowledgeEntries, error: knowledgeLookupError } = await ctx.db
      .from('knowledge_entries')
      .select('id')
      .in('evaluation_id', evaluationIds);
    if (knowledgeLookupError) throw new ApiError(500, knowledgeLookupError.message);

    const knowledgeIds = (knowledgeEntries ?? []).map((entry) => String(entry.id));
    for (const [ownerType, ids] of [
      ['evaluation', evaluationIds],
      ['knowledge_entry', knowledgeIds],
    ] as const) {
      for (const id of ids) {
        const { error } = await ctx.db
          .from('embeddings')
          .delete()
          .eq('owner_type', ownerType)
          .eq('owner_id', id);
        if (error) throw new ApiError(500, error.message);
      }
    }

    if (knowledgeIds.length > 0) {
      const { error } = await ctx.db.from('knowledge_entries').delete().in('id', knowledgeIds);
      if (error) throw new ApiError(500, error.message);
    }
  }

  const { error } = await ctx.db.from('interviews').delete().eq('id', interviewId);
  if (error) throw new ApiError(500, error.message);

  return NextResponse.json({ deleted: true });
});