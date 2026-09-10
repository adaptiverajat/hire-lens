import Link from 'next/link';
import { maskName } from '@/lib/utils/mask';
import { getDemoEnabled } from '@/lib/demo/server-store';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/indicators';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { RECOMMENDATION_LABELS } from '@/types/domain';

export const metadata = { title: 'Transcripts - HireLens' };

interface InterviewWithTranscript {
  id: string;
  round: number;
  stage: string;
  status: string;
  created_at: string;
  interviewer_name: string | null;
  job_id: string;
  candidate_id: string;
  candidates: { full_name: string } | null;
  transcripts: Array<{
    id: string;
    source: string;
    word_count: number | null;
    participants: string[];
    created_at: string;
  }>;
}

export default async function TranscriptsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const db = createSupabaseAdminClient();

  const demo = await getDemoEnabled();

  const { data: jobs } = await db.from('jobs').select('id, title');
  const jobIds = (jobs ?? []).map((j) => j.id);
  const jobTitles = new Map((jobs ?? []).map((j) => [j.id, j.title as string]));

  if (jobIds.length === 0) {
    return (
      <>
        <PageHeader title="Transcripts" description="Interview transcripts and their evaluations." />
        <EmptyState
          title="Nothing here yet"
          description="Create a job and add a candidate first. Transcripts attach to interview rounds."
        />
      </>
    );
  }

  const [{ data: interviews }, { data: evaluations }] = await Promise.all([
    db
      .from('interviews')
      .select(
        'id, round, stage, status, created_at, interviewer_name, job_id, candidate_id, candidates(full_name), transcripts(id, source, word_count, participants, created_at)'
      )
      .in('job_id', jobIds)
      .order('created_at', { ascending: false }),
    db
      .from('evaluations')
      .select('id, transcript_id, overall_rating, recommendation')
      .in('job_id', jobIds),
  ]);

  const typed = (interviews ?? []) as unknown as InterviewWithTranscript[];
  const evalByTranscript = new Map(
    (evaluations ?? []).map((e) => [e.transcript_id as string, e])
  );

  // Only interviews that actually have a transcript are interesting here.
  const withTranscripts = typed.filter((i) => (i.transcripts ?? []).length > 0);
  const pending = typed.filter((i) => (i.transcripts ?? []).length === 0);

  return (
    <>
      <PageHeader
        title="Transcripts"
        description="Every recorded interview, and whether it has been evaluated."
      />

      {withTranscripts.length === 0 && pending.length === 0 ? (
        <EmptyState
          title="No interviews recorded"
          description="Open a candidate, add an interview round, then attach the Teams transcript."
        />
      ) : (
        <div className="space-y-6">
          {withTranscripts.length > 0 && (
            <section id="transcripts-recorded-section" className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                Recorded ({withTranscripts.length})
              </h2>
              {withTranscripts.map((interview) =>
                (interview.transcripts ?? []).map((transcript) => {
                  const evaluation = evalByTranscript.get(transcript.id);

                  return (
                    <Card key={transcript.id} id={`transcript-card-${transcript.id}`}>
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-base">
                              <Link
                                href={`/candidates/${interview.candidate_id}`}
                                className="hover:underline"
                              >
                                {interview.candidates?.full_name ? maskName(interview.candidates.full_name, demo) : 'Candidate'}
                              </Link>
                            </CardTitle>
                            <CardDescription>
                              {jobTitles.get(interview.job_id)} · Round {interview.round} ·{' '}
                              {interview.stage.replace('_', ' ')} ·{' '}
                              {new Date(transcript.created_at).toLocaleDateString()}
                            </CardDescription>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="font-normal">
                              {transcript.source}
                            </Badge>
                            {evaluation ? (
                              <>
                                <Badge variant="secondary">{evaluation.overall_rating}/10</Badge>
                                <Badge
                                  variant={
                                    String(evaluation.recommendation).includes('no_hire')
                                      ? 'destructive'
                                      : 'default'
                                  }
                                >
                                  {RECOMMENDATION_LABELS[String(evaluation.recommendation)] ??
                                    evaluation.recommendation}
                                </Badge>
                              </>
                            ) : (
                              <Badge variant="outline">Not evaluated</Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 text-xs text-muted-foreground">
                        {transcript.word_count ? `${transcript.word_count} words` : 'Length unknown'}
                        {transcript.participants?.length
                          ? ` · ${transcript.participants.join(', ')}`
                          : ''}
                        {!evaluation && ' · open the candidate to evaluate this transcript'}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </section>
          )}

          {pending.length > 0 && (
            <section id="transcripts-pending-section" className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                Awaiting a transcript ({pending.length})
              </h2>
              <div className="divide-y rounded-lg border">
                {pending.map((interview) => (
                  <Link
                    key={interview.id}
                    href={`/candidates/${interview.candidate_id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {interview.candidates?.full_name ? maskName(interview.candidates.full_name, demo) : 'Candidate'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {jobTitles.get(interview.job_id)} · Round {interview.round} ·{' '}
                        {interview.stage.replace('_', ' ')}
                      </p>
                    </div>
                    <Badge variant="secondary">{interview.status}</Badge>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
