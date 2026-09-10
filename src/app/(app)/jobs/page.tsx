import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, StatusBadge } from '@/components/shared/indicators';
import { ButtonLink } from '@/components/shared/button-link';
import { Badge } from '@/components/ui/badge';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { displaySkill } from '@/lib/domain/skills';

export const metadata = { title: 'Jobs - HireLens' };

export default async function JobsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const db = createSupabaseAdminClient();

  const { data: jobs } = await db
    .from('jobs')
    .select('id, title, department, location, status, parse_status, seniority, deadline_date, created_at')
    .order('created_at', { ascending: false });

  const jobIds = (jobs ?? []).map((j) => j.id);

  const [{ data: candidates }, { data: skills }] = await Promise.all([
    jobIds.length
      ? db.from('candidates').select('id, job_id').in('job_id', jobIds)
      : Promise.resolve({ data: [] as Array<{ id: string; job_id: string }> }),
    jobIds.length
      ? db
          .from('job_skills')
          .select('job_id, skill, importance')
          .in('job_id', jobIds)
          .order('importance', { ascending: false })
      : Promise.resolve({ data: [] as Array<{ job_id: string; skill: string; importance: number }> }),
  ]);

  const countByJob = new Map<string, number>();
  for (const c of candidates ?? []) {
    countByJob.set(c.job_id, (countByJob.get(c.job_id) ?? 0) + 1);
  }

  const skillsByJob = new Map<string, string[]>();
  for (const s of skills ?? []) {
    const list = skillsByJob.get(s.job_id) ?? [];
    if (list.length < 6) list.push(s.skill);
    skillsByJob.set(s.job_id, list);
  }

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Every role you are hiring for, with its extracted requirements."
        actions={<ButtonLink href="/jobs/new">Create job</ButtonLink>}
      />

      {(jobs ?? []).length === 0 ? (
        <EmptyState
          title="No jobs yet"
          description="Upload or paste a job description. The JD Agent extracts skills, technologies, certifications and domain keywords with an importance weighting for each."
          action={<ButtonLink href="/jobs/new">Create your first job</ButtonLink>}
        />
      ) : (
        <div id="jobs-list" className="grid gap-4 md:grid-cols-2">
          {(jobs ?? []).map((job) => {
            const jobSkills = skillsByJob.get(job.id) ?? [];
            return (
              <Link
                key={job.id}
                id={`job-link-${job.id}`}
                href={`/jobs/${job.id}`}
                className="rounded-lg border p-5 transition-colors hover:border-primary/40 hover:bg-muted/40"
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

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {jobSkills.length > 0 ? (
                    jobSkills.map((skill) => (
                      <Badge key={skill} variant="secondary" className="font-normal">
                        {displaySkill(skill)}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {job.parse_status === 'complete'
                        ? 'No requirements extracted'
                        : 'Requirements not extracted yet'}
                    </span>
                  )}
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
