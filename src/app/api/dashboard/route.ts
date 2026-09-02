import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/handler';

export const runtime = 'nodejs';

/** GET /api/dashboard - aggregate metrics for the dashboard screen. */
export const GET = withAuth(async (ctx) => {
  const { data: jobs } = await ctx.db
    .from('jobs')
    .select('id, title, status, created_at, parse_status')
    .eq('created_by', ctx.userId)
    .order('created_at', { ascending: false });

  const jobIds = (jobs ?? []).map((j) => j.id);

  if (jobIds.length === 0) {
    return NextResponse.json({
      jobs: { total: 0, open: 0, draft: 0, closed: 0, on_hold: 0 },
      candidates: { total: 0, by_status: {} },
      pipeline: { analysed: 0, interviewed: 0, awaiting_review: 0 },
      flags: { open: 0, red: 0, yellow: 0 },
      averages: { match_score: null, interview_rating: null },
      recent_jobs: [],
      recent_activity: [],
    });
  }

  const [candidates, analyses, evaluations, flags, runs] = await Promise.all([
    ctx.db.from('candidates').select('id, status, job_id').in('job_id', jobIds),
    ctx.db.from('match_analyses').select('candidate_id, match_score').in('job_id', jobIds),
    ctx.db.from('evaluations').select('candidate_id, overall_rating').in('job_id', jobIds),
    ctx.db.from('flags').select('level, status').in('job_id', jobIds),
    ctx.db
      .from('agent_runs')
      .select('id, workflow, status, started_at, finished_at, job_id, candidate_id')
      .eq('created_by', ctx.userId)
      .order('started_at', { ascending: false })
      .limit(10),
  ]);

  const candidateRows = candidates.data ?? [];
  const byStatus = candidateRows.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  const countJobs = (status: string) => (jobs ?? []).filter((j) => j.status === status).length;

  const analysisRows = analyses.data ?? [];
  const evaluationRows = evaluations.data ?? [];
  const flagRows = flags.data ?? [];

  const average = (values: number[]) =>
    values.length === 0
      ? null
      : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

  return NextResponse.json({
    jobs: {
      total: jobs?.length ?? 0,
      open: countJobs('open'),
      draft: countJobs('draft'),
      closed: countJobs('closed'),
      on_hold: countJobs('on_hold'),
    },
    candidates: { total: candidateRows.length, by_status: byStatus },
    pipeline: {
      analysed: new Set(analysisRows.map((a) => a.candidate_id)).size,
      interviewed: new Set(evaluationRows.map((e) => e.candidate_id)).size,
      awaiting_review: flagRows.filter((f) => f.status === 'open').length,
    },
    flags: {
      open: flagRows.filter((f) => f.status === 'open').length,
      red: flagRows.filter((f) => f.level === 'RED' && f.status === 'open').length,
      yellow: flagRows.filter((f) => f.level === 'YELLOW' && f.status === 'open').length,
    },
    averages: {
      match_score: average(analysisRows.map((a) => a.match_score)),
      interview_rating: average(evaluationRows.map((e) => Number(e.overall_rating))),
    },
    recent_jobs: (jobs ?? []).slice(0, 5),
    recent_activity: runs.data ?? [],
  });
});
