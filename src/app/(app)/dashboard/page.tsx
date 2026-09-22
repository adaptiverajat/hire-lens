import Link from 'next/link';
import { AlertCircle, Briefcase, ChevronRight, ClipboardCheck, Users } from 'lucide-react';
import { maskName } from '@/lib/utils/mask';
import { getDemoEnabled } from '@/lib/demo/server-store';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, StatCard, StatusBadge } from '@/components/shared/indicators';
import { ButtonLink } from '@/components/shared/button-link';
import { AddCandidateDialog } from '@/components/candidates/add-candidate-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Dashboard - HireLens' };

export default async function DashboardPage() {
  const demo = await getDemoEnabled();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.getUser();

  const db = createSupabaseAdminClient();
  const { data: jobs } = await db
    .from('jobs')
    .select('id, title, status, priority, department, location, created_at')
    .order('created_at', { ascending: false });

  const jobRows = jobs ?? [];
  const jobIds = jobRows.map((job) => job.id);
  const { data: candidates } = jobIds.length
    ? await db
        .from('candidates')
        .select('id, full_name, status, job_id, created_at')
        .in('job_id', jobIds)
    : { data: [] as Array<{ id: string; full_name: string; status: string; job_id: string; created_at: string }> };
  const candidateRows = candidates ?? [];

  const candidateIds = candidateRows.map((candidate) => candidate.id);
  const { count: interviewsEvaluated } = candidateIds.length
    ? await db
        .from('evaluations')
        .select('id', { count: 'exact', head: true })
        .in('candidate_id', candidateIds)
    : { count: 0 };

  const candidatesByJob = new Map<string, typeof candidateRows>();
  for (const candidate of candidateRows) {
    const list = candidatesByJob.get(candidate.job_id) ?? [];
    list.push(candidate);
    candidatesByJob.set(candidate.job_id, list);
  }

  const openPositions = jobRows.filter((job) => job.status === 'open');
  const closedPositions = jobRows.filter((job) => job.status !== 'open');
  const urgentOpenJobs = openPositions.filter((job) => job.priority === 'urgent').length;
  const weekAgoMs = Date.now() - 7 * 86_400_000;
  const newCandidatesThisWeek = candidateRows.filter(
    (candidate) => new Date(candidate.created_at).getTime() >= weekAgoMs,
  ).length;
  const countStatus = (status: string) => candidateRows.filter((candidate) => candidate.status === status).length;

  function PositionList({
    positions,
    emptyText,
  }: {
    positions: typeof jobRows;
    emptyText: string;
  }) {
    if (positions.length === 0) {
      return <p className="px-4 py-6 text-sm text-muted-foreground">{emptyText}</p>;
    }

    return (
      <div className="divide-y">
        {positions.map((job) => {
          const appliedCandidates = candidatesByJob.get(job.id) ?? [];
          return (
            <details key={job.id} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-blue-200 dark:hover:bg-blue-950/40 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
                <Link href={`/jobs/${job.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                  {job.title}
                </Link>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {appliedCandidates.length} candidate{appliedCandidates.length === 1 ? '' : 's'}
                </span>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <StatusBadge status={job.status} />
                  {job.priority === 'urgent' && (
                    <span
                      className="text-base font-bold leading-none text-destructive"
                      title="Urgent priority"
                      aria-label="Urgent priority"
                    >
                      *
                    </span>
                  )}
                  <span
                    className="hidden text-xs text-muted-foreground md:inline"
                    title={`Created ${new Date(job.created_at).toLocaleDateString()}`}
                  >
                    {Math.max(
                      0,
                      Math.floor(
                        (Date.now() - new Date(job.created_at).getTime()) / 86_400_000,
                      ),
                    )}
                    d
                  </span>
                </div>
              </summary>
              <div className="border-t bg-muted/20 px-11 py-3">
                {appliedCandidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No candidates have applied yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {appliedCandidates.map((candidate) => (
                      <li key={candidate.id} className="flex items-center justify-between gap-3 text-sm">
                        <Link href={`/candidates/${candidate.id}`} className="truncate font-medium hover:underline">
                          {maskName(candidate.full_name, demo)}
                        </Link>
                        <StatusBadge status={candidate.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Pipeline health across the shared hiring workspace."
        actions={
          <>
            <AddCandidateDialog
              jobs={openPositions.map(({ id, title, department, location }) => ({
                id,
                title,
                department,
                location,
              }))}
            />
            <ButtonLink href="/jobs/new">
              <Briefcase data-icon="inline-start" aria-hidden />
              Create job
            </ButtonLink>
          </>
        }
      />

      {jobRows.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          description="Create a job and upload its description. HireLens extracts the requirements, then scores every candidate against them."
          action={
            <ButtonLink href="/jobs/new">
              <Briefcase data-icon="inline-start" aria-hidden />
              Create your first job
            </ButtonLink>
          }
        />
      ) : (
        <div className="space-y-8">
          <section id="dashboard-stats-section" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              id="stat-open-jobs"
              label="Open jobs"
              value={openPositions.length}
              hint={`${jobRows.length} total`}
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
              id="stat-total-candidates"
              label="Total candidates"
              value={candidateRows.length}
              hint={newCandidatesThisWeek === 1 ? '1 new this week' : `${newCandidatesThisWeek} new this week`}
              icon={<Users className="size-5" aria-hidden />}
            />
            <StatCard
              id="stat-interviews-evaluated"
              label="Interviews evaluated"
              value={interviewsEvaluated ?? 0}
              hint="Transcripts scored by AI"
              icon={<ClipboardCheck className="size-5" aria-hidden />}
            />
          </section>

          <section id="dashboard-jobs-section" className="space-y-6">
            <Card id="dashboard-open-positions">
              <CardHeader className="pb-3">
                <CardTitle>Open positions</CardTitle>
                <CardDescription>Expand a role to see the candidates who have applied.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <PositionList positions={openPositions} emptyText="No open positions." />
              </CardContent>
            </Card>

            <Card id="dashboard-closed-positions">
              <CardHeader className="pb-3">
                <CardTitle>Closed positions</CardTitle>
                <CardDescription>Closed, on-hold, and draft roles.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <PositionList positions={closedPositions} emptyText="No closed positions." />
              </CardContent>
            </Card>
          </section>

          <section id="dashboard-activity-section">
            <Card id="dashboard-pipeline-card">
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
                  const percentage = candidateRows.length === 0
                    ? 0
                    : Math.round((count / candidateRows.length) * 100);
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-sm text-muted-foreground">{label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right text-sm tabular-nums">{count}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </>
  );
}
