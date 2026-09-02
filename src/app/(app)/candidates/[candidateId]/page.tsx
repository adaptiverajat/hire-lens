import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { maskEmail, maskName } from '@/lib/utils/mask';
import { getDemoEnabled } from '@/lib/demo/server-store';
import { PageHeader } from '@/components/shared/page-header';
import { ScoreBadge, StatusBadge } from '@/components/shared/indicators';
import { CandidateActions } from '@/components/candidates/candidate-actions';
import { CandidateExport } from '@/components/candidates/candidate-export';
import { AnalysisPanel } from '@/components/candidates/analysis-panel';
import { QuestionsPanel } from '@/components/candidates/questions-panel';
import { InterviewsPanel } from '@/components/candidates/interviews-panel';
import { ReviewPanel } from '@/components/candidates/review-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  CandidateRow,
  CandidateSkillRowFull,
  EvaluationRow,
  FeedbackRow,
  FlagRowFull,
  InterviewRow,
  JobRow,
  MatchAnalysisRow,
  QuestionSetRow,
} from '@/types/domain';

type Props = { params: Promise<{ candidateId: string }> };

export default async function CandidatePage({ params }: Props) {
  const { candidateId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const db = createSupabaseAdminClient();

  const { data: candidate } = await db
    .from('candidates')
    .select('*')
    .eq('id', candidateId)
    .maybeSingle();

  if (!candidate) notFound();

  // Ownership runs through the job.
  const { data: job } = await db
    .from('jobs')
    .select('*')
    .eq('id', candidate.job_id)
    .eq('created_by', user!.id)
    .maybeSingle();

  if (!job) notFound();

  const demo = await getDemoEnabled();

  const [skills, analysis, questionSets, interviews, evaluations, flags, feedback] =
    await Promise.all([
      db
        .from('candidate_skills')
        .select('id, skill, raw_label, category, proficiency, years, evidence')
        .eq('candidate_id', candidateId),
      db
        .from('match_analyses')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from('question_sets')
        .select('id, label, notes, created_at, questions(*)')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false }),
      db
        .from('interviews')
        .select(
          'id, round, stage, status, scheduled_at, interviewer_name, created_at, transcripts(id, source, word_count, participants, created_at)'
        )
        .eq('candidate_id', candidateId)
        .order('round'),
      db
        .from('evaluations')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false }),
      db
        .from('flags')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false }),
      db
        .from('feedback')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false }),
    ]);

  const typedCandidate = candidate as CandidateRow;
  const typedJob = job as JobRow;
  const typedAnalysis = (analysis.data ?? null) as MatchAnalysisRow | null;
  const typedFlags = (flags.data ?? []) as FlagRowFull[];
  const typedEvaluations = (evaluations.data ?? []) as EvaluationRow[];

  const openFlags = typedFlags.filter((f) => f.status === 'open');
  const worstOpen = openFlags.some((f) => f.level === 'RED')
    ? 'RED'
    : openFlags.some((f) => f.level === 'YELLOW')
      ? 'YELLOW'
      : null;

  return (
    <>
      <Link
        href={`/jobs/${typedJob.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {typedJob.title}
      </Link>

      <PageHeader
        title={maskName(typedCandidate.full_name, demo) ?? ''}
        description={
          [
            typedCandidate.headline,
            maskEmail(typedCandidate.email, demo),
            typedCandidate.total_years_experience !== null
              ? `${typedCandidate.total_years_experience} yrs experience`
              : null,
          ]
            .filter(Boolean)
            .join(' · ') || undefined
        }
        actions={
          <CandidateActions
            candidateId={candidateId}
            candidateName={typedCandidate.full_name}
            parseStatus={typedCandidate.parse_status}
            jobParsed={typedJob.parse_status === 'complete'}
            hasAnalysis={Boolean(typedAnalysis)}
          />
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={typedCandidate.status} />
        <ScoreBadge score={typedAnalysis?.match_score ?? null} />
        {typedAnalysis?.verdict && (
          <Badge variant="outline">{typedAnalysis.verdict.replace('_', ' ')}</Badge>
        )}
        {typedEvaluations[0] && (
          <Badge variant="secondary">
            Interview {typedEvaluations[0].overall_rating}/10
          </Badge>
        )}
        {worstOpen && (
          <Badge variant={worstOpen === 'RED' ? 'destructive' : 'secondary'}>
            {openFlags.length} open flag{openFlags.length === 1 ? '' : 's'}
          </Badge>
        )}
      </div>

      {typedCandidate.parse_status === 'failed' && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Resume parsing failed</AlertTitle>
          <AlertDescription>
            {typedCandidate.parse_error ?? 'The Resume Agent could not parse this resume.'}
          </AlertDescription>
        </Alert>
      )}

      <Tabs id="candidate-tabs" defaultValue="analysis">
        <div id="candidate-tabs-header" className="flex items-center justify-between gap-4">
          <TabsList id="candidate-tabs-menu">
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="questions">
              Questions
              {(questionSets.data ?? []).length > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {((questionSets.data ?? []) as QuestionSetRow[]).reduce(
                    (n, s) => n + (s.questions?.length ?? 0),
                    0
                  )}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="interviews">
              Interviews
              {(interviews.data ?? []).length > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {(interviews.data ?? []).length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="review">
              Review
              {openFlags.length > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">{openFlags.length}</span>
              )}
            </TabsTrigger>
          </TabsList>
          <CandidateExport
            candidate={typedCandidate}
            job={typedJob}
            analysis={typedAnalysis}
            questionSets={(questionSets.data ?? []) as QuestionSetRow[]}
          />
        </div>

        <TabsContent value="analysis" id="candidate-analysis-tab" className="mt-6">
          <AnalysisPanel
            candidate={typedCandidate}
            skills={(skills.data ?? []) as CandidateSkillRowFull[]}
            analysis={typedAnalysis}
            jobParsed={typedJob.parse_status === 'complete'}
          />
        </TabsContent>

        <TabsContent value="questions" id="candidate-questions-tab" className="mt-6">
          <QuestionsPanel sets={(questionSets.data ?? []) as QuestionSetRow[]} />
        </TabsContent>

        <TabsContent value="interviews" id="candidate-interviews-tab" className="mt-6">
          <InterviewsPanel
            candidateId={candidateId}
            interviews={(interviews.data ?? []) as InterviewRow[]}
            evaluations={typedEvaluations}
            demo={demo}
          />
        </TabsContent>

        <TabsContent value="review" id="candidate-review-tab" className="mt-6">
          <ReviewPanel
            candidateId={candidateId}
            candidateStatus={typedCandidate.status}
            flags={typedFlags}
            evaluations={typedEvaluations}
            feedback={(feedback.data ?? []) as FeedbackRow[]}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
