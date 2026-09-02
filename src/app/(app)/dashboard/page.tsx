import Link from 'next/link';
import { AlertCircle, Briefcase, Layers, ShieldAlert, Users } from 'lucide-react';
import { maskName } from '@/lib/utils/mask';
import { getDemoEnabled } from '@/lib/demo/server-store';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, StatCard, StatusBadge } from '@/components/shared/indicators';
import { ButtonLink } from '@/components/shared/button-link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Dashboard - HireLens' };

const WORKFLOW_LABELS: Record<string, string> = {
  jd_intake: 'JD parsed',
  resume_intake: 'Resume parsed',
  candidate_analysis: 'Candidate analysed',
  transcript_review: 'Transcript reviewed',
};

export default async function DashboardPage() {
  const demo = await getDemoEnabled();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const db = createSupabaseAdminClient();
  const userId = user!.id;

  const { data: jobs } = await db
    .from('jobs')
    .select('id, title, status, parse_status, priority, created_at')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });

  const jobIds = (jobs ?? []).map((j) => j.id);

  const [candidates, flags, runs] = await Promise.all([
    jobIds.length
      ? db.from('candidates').select('id, full_name, status, job_id').in('job_id', jobIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; status: string; job_id: string }> }),
    jobIds.length
      ? db.from('flags').select('level, status').in('job_id', jobIds)
      : Promise.resolve({ data: [] as Array<{ level: string; status: string }> }),
    db
      .from('agent_runs')
      .select('id, workflow, status, started_at')
      .eq('created_by', userId)
      .order('started_at', { ascending: false })
      .limit(8),
  ]);

  const candidateRows = candidates.data ?? [];
  const flagRows = flags.data ?? [];

  const candidatesByJob = new Map<string, typeof candidateRows>();
  for (const c of candidateRows) {
    const list = candidatesByJob.get(c.job_id) ?? [];
    list.push(c);
    candidatesByJob.set(c.job_id, list);
  }

  const totalJobs = (jobs ?? []).length;
  const openJobs = (jobs ?? []).filter((j) => j.status === 'open').length;
  const urgentOpenJobs = (jobs ?? []).filter((j) => j.status === 'open' && j.priority === 'urgent').length;
  const openFlags = flagRows.filter((f) => f.status === 'open');
  const redFlags = openFlags.filter((f) => f.level === 'RED').length;

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
            <StatCard
              id="stat-total-jobs"
              label="Total jobs"
              value={totalJobs}
              hint={`${openJobs} still open`}
              icon={<Layers className="size-5" aria-hidden />}
            />
            <StatCard
              id="stat-total-candidates"
              label="Total candidates"
              value={candidateRows.length}
              hint={`${countStatus('new')} new`}
              icon={<Users className="size-5" aria-hidden />}
            />
            <StatCard
              id="stat-awaiting-review"
              label="Awaiting review"
              value={openFlags.length}
              hint={redFlags > 0 ? `${redFlags} must resolve` : 'No blocking flags'}
              icon={<ShieldAlert className="size-5" aria-hidden />}
            />
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
