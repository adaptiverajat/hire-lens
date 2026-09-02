import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody, withAuth } from '@/lib/api/handler';
import { getMergedPrompts, setPrompt } from '@/lib/demo/prompts-db';

export const runtime = 'nodejs';

const savePromptSchema = z.object({
  agent: z.string().min(1),
  system: z.string(),
  user: z.string(),
});

/** GET /api/prompts - returns the full prompt catalog, defaults + DB overrides. */
export const GET = withAuth(async (ctx) => {
  const prompts = await getMergedPrompts(ctx.db);
  return NextResponse.json(prompts);
});

/** POST /api/prompts - upserts a custom prompt for an agent. */
export const POST = withAuth(async (ctx, request: Request) => {
  const body = await parseBody(request, savePromptSchema);
  await setPrompt(ctx.db, body.agent, { system: body.system, user: body.user }, ctx.userId);
  const prompts = await getMergedPrompts(ctx.db);
  return NextResponse.json(prompts);
});
