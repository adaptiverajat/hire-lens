import Link from 'next/link';
import { redirect } from 'next/navigation';
import { maskEmail, maskName } from '@/lib/utils/mask';
import { getDemoEnabled } from '@/lib/demo/server-store';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ScoreBadge, StatusBadge } from '@/components/shared/indicators';
import { ButtonLink } from '@/components/shared/button-link';
import { JobActions } from '@/components/jobs/job-actions';
import { EditJobDialog } from '@/components/jobs/edit-job-dialog';
import { CandidateComparison, type ComparisonCandidate } from '@/components/jobs/candidate-comparison';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { displaySkill } from '@/lib/domain/skills';
import type { JdExtraction } from '@/lib/agents/schemas';

type Props = { params: Promise<{ jobId: string }> };

export const dynamic = 'force-dynamic';

export default async function JobDetailPage({ params }: Props) {
  const { jobId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const db = createSupabaseAdminClient();

  const { data: job } = await db
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (!job) redirect('/jobs');

  const demo = await getDemoEnabled();

  const [{ data: skills }, { data: candidates }] = await Promise.all([
    db
      .from('job_skills')
      .select('id, skill, raw_label, category, importance, is_required, min_years')
      .eq('job_id', jobId)
      .order('importance', { ascending: false }),
    db
      .from('candidates')
      .select('id, full_name, email, status, parse_status, total_years_experience, created_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false }),
  ]);

  const candidateIds = (candidates ?? []).map((c) => c.id);

  const scores = new Map<string, number>();
  const verdicts = new Map<string, string>();
  const flagLevels = new Map<string, string>();
  const flagCounts = new Map<string, number>();
  const evals = new Map<string, { overall: number; technical: number; communication: number; recommendation: string | null }>();
  const decisions = new Map<string, string>();

  if (candidateIds.length > 0) {
    const [{ data: analyses }, { data: flags }, { data: evaluations }, { data: feedback }] = await Promise.all([
      db
        .from('match_analyses')
        .select('candidate_id, match_score, verdict, created_at')
        .in('candidate_id', candidateIds)
        .order('created_at', { ascending: false }),
      db
        .from('flags')
        .select('candidate_id, level, status')
        .in('candidate_id', candidateIds)
        .eq('status', 'open'),
      db
        .from('evaluations')
        .select('candidate_id, overall_rating, technical_assessment, communication_assessment, recommendation, created_at')
        .in('candidate_id', candidateIds)
        .order('created_at', { ascending: false }),
      db
        .from('feedback')
        .select('candidate_id, final_decision, created_at')
        .in('candidate_id', candidateIds)
        .order('created_at', { ascending: false }),
    ]);

    for (const a of analyses ?? []) {
      if (!scores.has(a.candidate_id)) {
        scores.set(a.candidate_id, a.match_score);
        verdicts.set(a.candidate_id, a.verdict ?? '');
      }
    }
    for (const f of flags ?? []) {
      // RED wins over YELLOW for the list indicator.
      if (f.level === 'RED' || !flagLevels.has(f.candidate_id)) {
        flagLevels.set(f.candidate_id, f.level);
      }
      flagCounts.set(f.candidate_id, (flagCounts.get(f.candidate_id) ?? 0) + 1);
    }
    for (const e of evaluations ?? []) {
      if (!evals.has(e.candidate_id)) {
        evals.set(e.candidate_id, {
          overall: e.overall_rating,
          technical: e.technical_assessment?.score ?? 0,
          communication: e.communication_assessment?.score ?? 0,
          recommendation: e.recommendation,
        });
      }
    }
    for (const fb of feedback ?? []) {
      if (!decisions.has(fb.candidate_id)) {
        decisions.set(fb.candidate_id, fb.final_decision);
      }
    }
  }

  // Build comparison rows for candidates with at least a match score or evaluation.
  const comparisonCandidates: ComparisonCandidate[] = (candidates ?? [])
    .filter((c) => scores.has(c.id) || evals.has(c.id))
    .map((c) => {
      const ev = evals.get(c.id);
      return {
        id: c.id,
        full_name: c.full_name,
        status: c.status,
        total_years_experience: c.total_years_experience,
        match_score: scores.get(c.id) ?? null,
        verdict: verdicts.get(c.id) || null,
        overall_rating: ev?.overall ?? null,
        technical_score: ev?.technical ?? null,
        communication_score: ev?.communication ?? null,
        flag_level: (flagLevels.get(c.id) as 'GREEN' | 'YELLOW' | 'RED') ?? null,
        open_flag_count: flagCounts.get(c.id) ?? 0,
        recommendation: ev?.recommendation ?? null,
        final_decision: decisions.get(c.id) ?? null,
      };
    });

  const structured = job.structured as JdExtraction | null;
  const required = (skills ?? []).filter((s) => s.is_required);
  const preferred = (skills ?? []).filter((s) => !s.is_required);

  return (
    <>
      <PageHeader
        title={job.title}
        description={
          [job.department, job.location, job.seniority].filter(Boolean).join(' · ') || undefined
        }
        actions={
          <>
            <ButtonLink href={`/jobs/${jobId}/candidates/new`}>Add candidate</ButtonLink>
            <EditJobDialog
              jobId={jobId}
              title={job.title}
              department={job.department}
              location={job.location}
              deadlineDate={job.deadline_date}
              priority={job.priority}
              descriptionRaw={job.description_raw}
            />
            <JobActions jobId={jobId} status={job.status} parseStatus={job.parse_status} />
          </>
        }
      />

      {job.parse_status === 'failed' && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Requirement extraction failed</AlertTitle>
          <AlertDescription>
            {job.parse_error ?? 'The JD Agent could not parse this description.'} Use Re-parse to try
            again.
          </AlertDescription>
        </Alert>
      )}

      {job.parse_status === 'pending' && (
        <Alert className="mb-6">
          <AlertTitle>Not analysed yet</AlertTitle>
          <AlertDescription>
            Run the JD Agent to extract structured requirements before scoring candidates.
          </AlertDescription>
        </Alert>
      )}

      <Tabs id="job-tabs" defaultValue="pipeline" className="mt-2">
        <TabsList id="job-tabs-menu">
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="compare">
            Compare
            {comparisonCandidates.length >= 2 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                {comparisonCandidates.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" id="job-pipeline-tab" className="mt-6">
          <div id="job-detail-grid" className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card id="job-candidates-card">
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle>Candidates</CardTitle>
                    <CardDescription>{candidates?.length ?? 0} submitted for this role.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  {(candidates ?? []).length === 0 ? (
                    <EmptyState
                      title="No candidates yet"
                      description="Add a candidate and upload their resume. HireLens scores them against this job's requirements and drafts an interview."
                      action={
                        <ButtonLink href={`/jobs/${jobId}/candidates/new`} size="sm">
                          Add candidate
                        </ButtonLink>
                      }
                    />
                  ) : (
                    <ul className="divide-y">
                      {(candidates ?? []).map((candidate) => (
                        <li key={candidate.id}>
                          <Link
                            href={`/candidates/${candidate.id}`}
                            className="-mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-3 transition-colors hover:bg-muted/50"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">{maskName(candidate.full_name, demo)}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {maskEmail(candidate.email, demo) ?? 'No email'}
                                {candidate.total_years_experience !== null &&
                                  ` · ${candidate.total_years_experience} yrs`}
                                {candidate.created_at &&
                                  ` · ${new Date(candidate.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {flagLevels.get(candidate.id) === 'RED' && (
                                <Badge variant="destructive">RED flag</Badge>
                              )}
                              {flagLevels.get(candidate.id) === 'YELLOW' && (
                                <Badge variant="secondary">Follow-up</Badge>
                              )}
                              <ScoreBadge score={scores.get(candidate.id) ?? null} />
                              <StatusBadge status={candidate.status} />
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {structured && (
                <Card id="job-role-profile-card">
                  <CardHeader>
                    <CardTitle>Extracted role profile</CardTitle>
                    <CardDescription>Produced by the JD Agent.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <p>{structured.summary}</p>

                    {structured.responsibilities.length > 0 && (
                      <div>
                        <h3 className="mb-1 font-medium">Responsibilities</h3>
                        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                          {structured.responsibilities.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {structured.domain_keywords.length > 0 && (
                      <div>
                        <h3 className="mb-2 font-medium">Domain</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {structured.domain_keywords.map((k) => (
                            <Badge key={k} variant="outline" className="font-normal">
                              {k}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card id="job-description-card">
                <CardHeader>
                  <CardTitle>Original description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
                    {job.description_raw}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card id="job-requirements-card">
                <CardHeader>
                  <CardTitle>Requirements</CardTitle>
                  <CardDescription>
                    {skills?.length ?? 0} extracted, weighted by importance.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {(skills ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing extracted yet.</p>
                  ) : (
                    <>
                      <RequirementGroup title="Must have" items={required} />
                      <RequirementGroup title="Preferred" items={preferred} />
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="compare" id="job-compare-tab" className="mt-6">
          <CandidateComparison candidates={comparisonCandidates} demo={demo} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function RequirementGroup({
  title,
  items,
}: {
  title: string;
  items: Array<{
    id: string;
    skill: string;
    category: string;
    importance: number;
    min_years: number | null;
  }>;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">
                {displaySkill(item.skill)}
                {item.min_years ? (
                  <span className="text-muted-foreground"> · {item.min_years}+ yrs</span>
                ) : null}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {item.importance}
              </span>
            </div>
            <Progress value={item.importance} className="h-1.5" />
          </li>
        ))}
      </ul>
    </div>
  );
}
