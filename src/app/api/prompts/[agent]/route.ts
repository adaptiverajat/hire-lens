import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/handler';
import { getMergedPrompts, resetPrompt } from '@/lib/demo/prompts-db';

export const runtime = 'nodejs';

type Params = { params: Promise<{ agent: string }> };

/** DELETE /api/prompts/:agent - removes the DB override and falls back to the default. */
export const DELETE = withAuth(async (ctx, _request: Request, { params }: Params) => {
  const { agent } = await params;
  await resetPrompt(ctx.db, agent);
  const prompts = await getMergedPrompts(ctx.db);
  return NextResponse.json(prompts);
});
