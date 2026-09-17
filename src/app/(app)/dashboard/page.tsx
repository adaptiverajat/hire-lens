import Link from 'next/link';
import { AlertCircle, Briefcase, Cpu, Gauge, Layers } from 'lucide-react';
import { maskName } from '@/lib/utils/mask';
import { getDemoEnabled } from '@/lib/demo/server-store';
import { getShowTokens } from '@/lib/demo/server-store';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, StatCard, StatusBadge } from '@/components/shared/indicators';
import { ButtonLink } from '@/components/shared/button-link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { totalTokensFromUsage, type TokenUsage } from '@/lib/ai/token-usage';
import { serverEnv } from '@/lib/env';

export const metadata = { title: 'Dashboard - HireLens' };

const WORKFLOW_LABELS: Record<string, string> = {
  jd_intake: 'JD parsed',
  resume_intake: 'Resume parsed',
  candidate_analysis: 'Candidate analysed',
  transcript_review: 'Transcript reviewed',
};

const OPENAI_PRICING_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
};

const FAST_AGENTS = new Set(['JD Agent', 'Resume Agent', 'Red Flag Agent']);

function pricingForModel(model: string) {
  return Object.entries(OPENAI_PRICING_USD_PER_MILLION)
    .sort(([a], [b]) => b.length - a.length)
    .find(([name]) => model === name || model.startsWith(`${name}-`))?.[1];
}

function estimatedOpenAiCost(agent: string, usage: TokenUsage, chatModel: string, fastModel: string) {
  const pricing = pricingForModel(FAST_AGENTS.has(agent) ? fastModel : chatModel);
  if (!pricing) return null;
  return (usage.promptTokens * pricing.input + usage.completionTokens * pricing.output) / 1_000_000;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 4 : 2,
  }).format(value);
}

export default async function DashboardPage() {
  const demo = await getDemoEnabled();
  const showTokens = await getShowTokens();
  const { OPENAI_CHAT_MODEL, OPENAI_FAST_MODEL } = serverEnv();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const db = createSupabaseAdminClient();
  const userId = user!.id;

  const { data: jobs } = await db
    .from('jobs')
    .select('id, title, status, parse_status, priority, created_at')
    .order('created_at', { ascending: false });

  const jobIds = (jobs ?? []).map((j) => j.id);

  const [candidates, runs] = await Promise.all([
    jobIds.length
      ? db.from('candidates').select('id, full_name, status, job_id').in('job_id', jobIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; status: string; job_id: string }> }),
    db
      .from('agent_runs')
      .select('id, workflow, status, started_at, output, candidate_id')
      .order('started_at', { ascending: false })
      .limit(8),
  ]);

  // Fetch ALL agent runs for token usage aggregation (not just the latest 8).
  const { data: allRuns } = showTokens
    ? await db
        .from('agent_runs')
        .select('id, workflow, status, started_at, output, candidate_id')
        .order('started_at', { ascending: false })
    : { data: [] };

  const candidateRows = candidates.data ?? [];

  const candidatesByJob = new Map<string, typeof candidateRows>();
  for (const c of candidateRows) {
    const list = candidatesByJob.get(c.job_id) ?? [];
    list.push(c);
    candidatesByJob.set(c.job_id, list);
  }

  const totalJobs = (jobs ?? []).length;
  const openJobs = (jobs ?? []).filter((j) => j.status === 'open').length;
  const urgentOpenJobs = (jobs ?? []).filter((j) => j.status === 'open' && j.priority === 'urgent').length;
  // --- Token usage metrics ---
  type RunRow = { output?: { token_usage?: Record<string, TokenUsage> } | null; started_at: string; candidate_id?: string | null };
  const allRunRows = (allRuns ?? []) as unknown as RunRow[];

  const totalTokenUsage = allRunRows.reduce(
    (sum, r) => sum + totalTokensFromUsage(r.output?.token_usage),
    0,
  );

  // Token usage this month.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const tokenUsageThisMonth = allRunRows
    .filter((r) => new Date(r.started_at) >= monthStart)
    .reduce((sum, r) => sum + totalTokensFromUsage(r.output?.token_usage), 0);

  // Avg token usage per candidate (unique candidate_ids with token data).
  const candidatesWithTokens = new Map<string, { tokens: number; cost: number | null }>();
  for (const r of allRunRows) {
    if (!r.candidate_id || !r.output?.token_usage) continue;
    const entries = Object.entries(r.output.token_usage);
    const tokens = totalTokensFromUsage(r.output.token_usage);
    if (tokens === 0) continue;
    const runCosts = entries.map(([agent, usage]) =>
      estimatedOpenAiCost(agent, usage, OPENAI_CHAT_MODEL, OPENAI_FAST_MODEL),
    );
    const runCost = runCosts.some((cost) => cost === null)
      ? null
      : runCosts.reduce<number>((sum, cost) => sum + (cost ?? 0), 0);
    const existing = candidatesWithTokens.get(r.candidate_id) ?? { tokens: 0, cost: 0 };
    candidatesWithTokens.set(r.candidate_id, {
      tokens: existing.tokens + tokens,
      cost: existing.cost === null || runCost === null ? null : existing.cost + runCost,
    });
  }
  const candidateUsage = Array.from(candidatesWithTokens.values());
  const avgTokenPerCandidate = candidatesWithTokens.size > 0
    ? Math.round(candidateUsage.reduce((sum, usage) => sum + usage.tokens, 0) / candidatesWithTokens.size)
    : 0;
  const avgCostPerCandidate = candidatesWithTokens.size > 0 && candidateUsage.every((usage) => usage.cost !== null)
    ? candidateUsage.reduce((sum, usage) => sum + (usage.cost ?? 0), 0) / candidatesWithTokens.size
    : null;

  const countStatus = (status: string) => candidateRows.filter((c) => c.status === status).length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Pipeline health across every role you own."
        actions={<ButtonLink href="/jobs/new">Create job</ButtonLink>}
      />

      {jobIds.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          description="Create a job and upload its description. HireLens extracts the requirements, then scores every candidate against them."
          action={<ButtonLink href="/jobs/new">Create your first job</ButtonLink>}
        />
      ) : (
        <div className="space-y-8">
          <section id="dashboard-stats-section" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              id="stat-open-jobs"
              label="Open jobs"
              value={openJobs}
              hint={`${totalJobs} total`}
              icon={<Briefcase className="size-5" aria-hidden />}
            />
            <StatCard
              id="stat-urgent-open-jobs"
              label="Urgent open jobs"
              value={urgentOpenJobs}
              hint={urgentOpenJobs === 1 ? '1 priority hire' : `${urgentOpenJobs} priority hires`}
              icon={<AlertCircle className="size-5" aria-hidden />}
            />
            {showTokens && (
              <>
                <StatCard
                  id="stat-total-token-usage"
                  label="Total token usage"
                  value={totalTokenUsage.toLocaleString()}
                  hint={`${candidatesWithTokens.size} candidates`}
                  icon={<Cpu className="size-5" aria-hidden />}
                />
                <StatCard
                  id="stat-token-usage-month"
                  label="Tokens this month"
                  value={tokenUsageThisMonth.toLocaleString()}
                  hint={now.toLocaleString('default', { month: 'long' })}
                  icon={<Layers className="size-5" aria-hidden />}
                />
                <StatCard
                  id="stat-avg-token-per-candidate"
                  label="Avg. tokens / candidate"
                  value={
                    <span>
                      {avgTokenPerCandidate.toLocaleString()}
                      <span className="block text-sm font-medium text-emerald-600">
                        {avgCostPerCandidate !== null ? `≈ ${formatUsd(avgCostPerCandidate)}` : 'cost unavailable'}
                      </span>
                    </span>
                  }
                  hint={candidatesWithTokens.size > 0
                    ? `${candidatesWithTokens.size} candidates · standard OpenAI rates; embeddings excluded`
                    : 'no data'}
                  icon={<Gauge className="size-5" aria-hidden />}
                />
              </>
            )}
          </section>

          <section id="dashboard-jobs-section">
            <h2 className="mb-3 text-lg font-semibold">Jobs</h2>
            <div className="max-h-[44rem] overflow-y-auto pr-2">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(jobs ?? []).map((job) => (
                  <Card key={job.id} id={`job-card-${job.id}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        <Link href={`/jobs/${job.id}`} className="hover:underline">
                          {job.title}
                        </Link>
                      </CardTitle>
                      <CardDescription>
                        {candidatesByJob.get(job.id)?.length ?? 0} candidates
                      </CardDescription>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {job.priority === 'urgent' && <Badge variant="destructive">Urgent</Badge>}
                        <StatusBadge status={job.status} />
                      </div>
                    </CardHeader>
                    <CardContent className="py-3">
                      {(candidatesByJob.get(job.id) ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No candidates yet.</p>
                      ) : (
                        <ul className="max-h-16 space-y-2 overflow-y-auto pr-1">
                          {(candidatesByJob.get(job.id) ?? []).map((c) => (
                            <li
                              key={c.id}
                              className="flex items-center justify-between gap-2 text-sm"
                            >
                              <Link
                                href={`/candidates/${c.id}`}
                                className="truncate font-medium hover:underline"
                              >
                                {maskName(c.full_name, demo)}
                              </Link>
                              <StatusBadge status={c.status} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          <section id="dashboard-activity-section" className="grid gap-6 lg:grid-cols-3">
            <Card id="dashboard-pipeline-card" className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Pipeline</CardTitle>
                <CardDescription>Candidates by stage.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(
                  [
                    ['new', 'New'],
                    ['screening', 'Screening'],
                    ['interviewing', 'Interviewing'],
                    ['offer', 'Offer'],
                    ['hired', 'Hired'],
                    ['rejected', 'Rejected'],
                    ['on_hold', 'On hold'],
                  ] as const
                ).map(([key, label]) => {
                  const count = countStatus(key);
                  const pct =
                    candidateRows.length === 0
                      ? 0
                      : Math.round((count / candidateRows.length) * 100);
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-sm text-muted-foreground">{label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right text-sm tabular-nums">{count}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card id="dashboard-agent-runs-card">
              <CardHeader>
                <CardTitle>Recent agent runs</CardTitle>
                <CardDescription>Latest workflow executions.</CardDescription>
              </CardHeader>
              <CardContent>
                {(runs.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No runs yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {(runs.data ?? []).map((run) => (
                      <li key={run.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">
                          {WORKFLOW_LABELS[run.workflow] ?? run.workflow}
                        </span>
                        <StatusBadge status={run.status === 'complete' ? 'complete' : run.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </>
  );
}
