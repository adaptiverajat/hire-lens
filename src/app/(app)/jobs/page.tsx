import Link from 'next/link';
import { Briefcase } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, StatusBadge } from '@/components/shared/indicators';
import { ButtonLink } from '@/components/shared/button-link';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

type JobsPageJob = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  status: string;
  seniority: string | null;
  deadline_date: string | null;
  created_at: string;
};

export const metadata = { title: 'Jobs - HireLens' };
export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  const db = createSupabaseAdminClient();

  const [{ data: rawJobs }, { data: rawCandidates }] = await Promise.all([
    db
      .from('jobs')
      .select('id, title, department, location, status, seniority, deadline_date, created_at')
      .order('created_at', { ascending: false }),
    db.from('candidates').select('id, job_id'),
  ]);

  const jobs = (rawJobs ?? []) as JobsPageJob[];
  const candidates = (rawCandidates ?? []) as Array<{ id: string; job_id: string }>;

  const countByJob = new Map<string, number>();
  for (const c of candidates ?? []) {
    countByJob.set(c.job_id, (countByJob.get(c.job_id) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Every role you are hiring for, with its extracted requirements."
        actions={
          <ButtonLink href="/jobs/new">
            <Briefcase data-icon="inline-start" aria-hidden />
            Create job
          </ButtonLink>
        }
      />

      {(jobs ?? []).length === 0 ? (
        <EmptyState
          title="No jobs yet"
          description="Upload or paste a job description. The JD Agent extracts skills, technologies, certifications and domain keywords with an importance weighting for each."
          action={
            <ButtonLink href="/jobs/new">
              <Briefcase data-icon="inline-start" aria-hidden />
              Create your first job
            </ButtonLink>
          }
        />
      ) : (
        <div id="jobs-list" className="grid gap-4 md:grid-cols-2">
          {(jobs ?? []).map((job) => {
            return (
              <Link
                key={job.id}
                id={`job-link-${job.id}`}
                href={`/jobs/${job.id}`}
                className="rounded-lg border p-5 transition-colors hover:border-blue-300 hover:bg-blue-200 dark:hover:bg-blue-950/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-medium">{job.title}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[job.department, job.location, job.seniority].filter(Boolean).join(' · ') ||
                        'No details set'}
                    </p>
                  </div>
                  <StatusBadge status={job.status} />
                </div>

                <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                  <span>{countByJob.get(job.id) ?? 0} candidates</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
