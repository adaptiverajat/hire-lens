import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody, withAuth } from '@/lib/api/handler';
import { retrieveSimilar } from '@/lib/ai/vector-store';

export const runtime = 'nodejs';
export const maxDuration = 60;

const searchSchema = z.object({
  query: z.string().min(3, 'Enter at least 3 characters'),
  owner_types: z
    .array(
      z.enum(['job', 'candidate', 'question', 'evaluation', 'knowledge_entry', 'recruiter_note'])
    )
    .nullish(),
  job_id: z.string().uuid().nullish(),
  limit: z.number().int().positive().max(50).default(10),
});

/** POST /api/knowledge/search - semantic search across the pgvector index. */
export const POST = withAuth(async (ctx, request: Request) => {
  const body = await parseBody(request, searchSchema);

  const results = await retrieveSimilar({
    query: body.query,
    userId: ctx.userId,
    ownerTypes: body.owner_types ?? undefined,
    jobId: body.job_id ?? null,
    limit: body.limit,
    minSimilarity: 0.1,
  });

  return NextResponse.json({ query: body.query, count: results.length, results });
});
