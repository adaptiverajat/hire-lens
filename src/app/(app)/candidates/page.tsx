import { getDemoEnabled } from '@/lib/demo/server-store';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/indicators';
import { ButtonLink } from '@/components/shared/button-link';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { CandidatesListWithExport } from '@/components/candidates/post-interview-export';
import type { EvaluationRow, FeedbackRow, FlagRowFull, InterviewRow } from '@/types/domain';

export const metadata = { title: 'Candidates - HireLens' };
export const dynamic = 'force-dynamic';

export default async function CandidatesPage() {
  const demo = await getDemoEnabled();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const db = createSupabaseAdminClient();
  const userId = user!.id;

  const { data: jobs } = await db
    .from('jobs')
    .select('id, title, status, created_at')
    .order('created_at', { ascending: false });

  const jobIds = (jobs ?? []).map((j) => j.id);

  const { data: candidates } = jobIds.length
    ? await db
        .from('candidates')
        .select('id, full_name, email, phone, location, headline, status, job_id, total_years_experience, created_at')
        .in('job_id', jobIds)
        .order('created_at', { ascending: false })
    : { data: [] as Array<{ id: string; full_name: string; email: string | null; phone: string | null; location: string | null; headline: string | null; status: string; job_id: string; total_years_experience: number | null; created_at: string }> };

  const candidateIds = (candidates ?? []).map((c) => c.id);

  // Fetch interviews (with transcripts), evaluations, flags, and feedback
  // to determine which candidates have been interviewed and build the export data.
  const [interviewsData, evaluationsData, flagsData, feedbackData] = await Promise.all([
    candidateIds.length
      ? db
          .from('interviews')
          .select('id, candidate_id, round, stage, status, scheduled_at, interviewer_name, created_at, transcripts(id, source, word_count, participants, created_at)')
          .in('candidate_id', candidateIds)
          .order('round')
      : Promise.resolve({ data: [] }),
    candidateIds.length
      ? db.from('evaluations').select('*').in('candidate_id', candidateIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    candidateIds.length
      ? db.from('flags').select('*').in('candidate_id', candidateIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    candidateIds.length
      ? db.from('feedback').select('*').in('candidate_id', candidateIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  // Build per-candidate lookup maps
  const interviewsByCandidate = new Map<string, InterviewRow[]>();
  for (const iv of (interviewsData.data ?? []) as InterviewRow[]) {
    const list = interviewsByCandidate.get(iv.candidate_id) ?? [];
    list.push(iv);
    interviewsByCandidate.set(iv.candidate_id, list);
  }
  const evaluationsByCandidate = new Map<string, EvaluationRow[]>();
  for (const ev of (evaluationsData.data ?? []) as EvaluationRow[]) {
    const list = evaluationsByCandidate.get(ev.candidate_id) ?? [];
    list.push(ev);
    evaluationsByCandidate.set(ev.candidate_id, list);
  }
  const flagsByCandidate = new Map<string, FlagRowFull[]>();
  for (const f of (flagsData.data ?? []) as FlagRowFull[]) {
    const list = flagsByCandidate.get(f.candidate_id) ?? [];
    list.push(f);
    flagsByCandidate.set(f.candidate_id, list);
  }
  const feedbackByCandidate = new Map<string, FeedbackRow[]>();
  for (const fb of (feedbackData.data ?? []) as FeedbackRow[]) {
    const list = feedbackByCandidate.get(fb.candidate_id) ?? [];
    list.push(fb);
    feedbackByCandidate.set(fb.candidate_id, list);
  }

  // A candidate is "interviewed" if they have at least one transcript
  const interviewedCandidateIds = new Set<string>();
  for (const [cid, ivs] of interviewsByCandidate) {
    if (ivs.some((iv) => iv.transcripts && iv.transcripts.length > 0)) {
      interviewedCandidateIds.add(cid);
    }
  }

  // Build export data for the PostInterviewExport component
  const exportJobs = (jobs ?? []).map((job) => {
    const jobCandidates = (candidates ?? []).filter((c) => c.job_id === job.id);
    return {
      id: job.id,
      title: job.title,
      status: job.status,
      candidates: jobCandidates.map((c) => ({
        id: c.id,
        full_name: c.full_name,
        email: c.email,
        phone: c.phone,
        location: c.location,
        headline: c.headline,
        total_years_experience: c.total_years_experience,
        status: c.status,
        created_at: c.created_at,
        hasTranscript: interviewedCandidateIds.has(c.id),
        evaluations: evaluationsByCandidate.get(c.id) ?? [],
        flags: flagsByCandidate.get(c.id) ?? [],
        feedback: feedbackByCandidate.get(c.id) ?? [],
      })),
    };
  });

  const hasCandidates = (candidates ?? []).length > 0;

  return (
    <>
      <PageHeader
        title="Candidates"
        description="Every candidate grouped by the role they applied for, latest jobs first."
      />

      {jobIds.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          description="Create a job and upload its description. HireLens extracts the requirements, then scores every candidate against them."
          action={<ButtonLink href="/jobs/new">Create your first job</ButtonLink>}
        />
      ) : !hasCandidates ? (
        <EmptyState
          title="No candidates yet"
          description="Once you add candidates to a job, they will appear here grouped by role."
          action={<ButtonLink href="/jobs">Go to jobs</ButtonLink>}
        />
      ) : (
        <CandidatesListWithExport
          jobs={(jobs ?? []).map((j) => ({ id: j.id, title: j.title, status: j.status, created_at: j.created_at }))}
          candidates={(candidates ?? []).map((c) => ({
            id: c.id,
            full_name: c.full_name,
            email: c.email,
            status: c.status,
            job_id: c.job_id,
            total_years_experience: c.total_years_experience,
            created_at: c.created_at,
          }))}
          exportJobs={exportJobs}
          demo={demo}
        />
      )}
    </>
  );
}
