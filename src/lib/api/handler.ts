import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { parseDemoHeaders, runWithDemo } from '@/lib/demo/server-store';

export interface AuthContext {
  userId: string;
  email: string;
  /** Service-role client. Always scope queries by `userId` / ownership. */
  db: SupabaseClient;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notFound = (what = 'Resource') => new ApiError(404, `${what} not found`);
export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, message, details);
export const forbidden = (message = 'Access denied') => new ApiError(403, message);

/**
 * Wraps a route handler with authentication and error translation.
 * The session comes from Supabase cookies (refreshed in middleware), so
 * handlers never touch headers or tokens directly.
 */
export function withAuth<TArgs extends unknown[]>(
  handler: (ctx: AuthContext, ...args: TArgs) => Promise<NextResponse | Response>
) {
  return async (...args: TArgs): Promise<NextResponse | Response> => {
    let ctx: AuthContext;

    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }

      ctx = {
        userId: user.id,
        email: user.email ?? '',
        db: createSupabaseAdminClient(),
      };
    } catch (error) {
      console.error('[api] auth failure', error);
      return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
    }

    try {
      const request = args.find((a): a is Request => a instanceof Request);
      const demoContext = request ? parseDemoHeaders(request.headers) : undefined;

      if (demoContext) {
        return await runWithDemo(demoContext, () => handler(ctx, ...args));
      }

      return await handler(ctx, ...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, details: error.details ?? undefined },
      { status: error.status }
    );
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: 'Validation failed', details: z.treeifyError(error) },
      { status: 422 }
    );
  }

  console.error('[api] unhandled error', error);
  const message = error instanceof Error ? error.message : 'Internal server error';
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Parses and validates a JSON request body. */
export async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw badRequest('Request body must be valid JSON');
  }
  return schema.parse(json);
}

export type Row = Record<string, unknown>;

/** Fetches a job the caller owns, or throws 404. */
export async function requireOwnedJob(ctx: AuthContext, jobId: string, columns = '*'): Promise<Row> {
  const { data, error } = await ctx.db
    .from('jobs')
    .select(columns)
    .eq('id', jobId)
    .eq('created_by', ctx.userId)
    .maybeSingle();

  if (error) throw new ApiError(500, error.message);
  if (!data) throw notFound('Job');
  return data as unknown as Row;
}

/**
 * Fetches a candidate the caller owns, or throws 404.
 * Ownership runs through the parent job, checked as a separate query so the
 * caller can pass an arbitrary column list.
 */
export async function requireOwnedCandidate(
  ctx: AuthContext,
  candidateId: string,
  columns = '*'
): Promise<Row> {
  const { data, error } = await ctx.db
    .from('candidates')
    .select(columns.includes('job_id') || columns === '*' ? columns : `${columns}, job_id`)
    .eq('id', candidateId)
    .maybeSingle();

  if (error) throw new ApiError(500, error.message);
  if (!data) throw notFound('Candidate');

  const record = data as unknown as Row;
  await requireOwnedJob(ctx, String(record.job_id), 'id');
  return record;
}

/** Fetches an interview the caller owns (via the job), or throws 404. */
export async function requireOwnedInterview(
  ctx: AuthContext,
  interviewId: string
): Promise<{ id: string; job_id: string; candidate_id: string; question_set_id: string | null }> {
  const { data, error } = await ctx.db
    .from('interviews')
    .select('id, job_id, candidate_id, question_set_id')
    .eq('id', interviewId)
    .maybeSingle();

  if (error) throw new ApiError(500, error.message);
  if (!data) throw notFound('Interview');

  await requireOwnedJob(ctx, data.job_id, 'id');
  return data;
}

/** Fetches a transcript the caller owns (via interview -> job), or throws 404. */
export async function requireOwnedTranscript(ctx: AuthContext, transcriptId: string) {
  const { data, error } = await ctx.db
    .from('transcripts')
    .select('id, interview_id')
    .eq('id', transcriptId)
    .maybeSingle();

  if (error) throw new ApiError(500, error.message);
  if (!data) throw notFound('Transcript');

  const interview = await requireOwnedInterview(ctx, data.interview_id);
  return { ...data, ...interview, id: data.id };
}
