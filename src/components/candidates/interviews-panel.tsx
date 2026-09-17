'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api/client';
import { redactPii } from '@/lib/ai/pii';
import { parseTranscript } from '@/lib/documents/transcript';
import { DocumentUpload } from '@/components/shared/document-upload';
import { EmptyState } from '@/components/shared/indicators';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { maskName, toCamelCase } from '@/lib/utils/mask';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RECOMMENDATION_LABELS, type EvaluationRow, type InterviewRow } from '@/types/domain';

const STAGES = [
  ['screening', 'Screening'],
  ['technical', 'Technical'],
  ['system_design', 'System design'],
  ['behavioural', 'Behavioural'],
  ['final', 'Final'],
] as const;

export function InterviewsPanel({
  candidateId,
  candidateName,
  interviews,
  evaluations,
  demo = false,
}: {
  candidateId: string;
  candidateName: string;
  interviews: InterviewRow[];
  evaluations: EvaluationRow[];
  demo?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [creating, setCreating] = useState(false);
  const [stage, setStage] = useState<string>('technical');
  const [interviewer, setInterviewer] = useState('');

  const [transcriptFor, setTranscriptFor] = useState<string | null>(null);
  const [transcriptText, setTranscriptText] = useState('');
  const [originalTranscriptText, setOriginalTranscriptText] = useState<string | null>(null);
  const [transcriptSource, setTranscriptSource] = useState<string>('teams');
  const [busy, setBusy] = useState<string | null>(null);

  const evaluationByTranscript = new Map(evaluations.map((e) => [e.transcript_id, e]));

  const refresh = () => startTransition(() => router.refresh());

  async function createInterview() {
    setBusy('create');
    try {
      await api.post(`/candidates/${candidateId}/interviews`, {
        stage,
        round: interviews.length + 1,
        interviewer_name: interviewer.trim() || null,
      });
      toast.success('Interview added');
      setCreating(false);
      setInterviewer('');
      refresh();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not add the interview');
    } finally {
      setBusy(null);
    }
  }

  async function saveTranscript(interviewId: string) {
    const textToSave = originalTranscriptText ?? transcriptText;
    if (textToSave.trim().length < 50) {
      toast.error('Transcript must be at least 50 characters');
      return;
    }

    setBusy(`transcript-${interviewId}`);
    try {
      await api.post(`/interviews/${interviewId}/transcripts`, {
        raw_text: textToSave.trim(),
        source: transcriptSource,
      });
      toast.success('Transcript saved. Run Evaluate to assess it.');
      setTranscriptFor(null);
      setTranscriptText('');
      setOriginalTranscriptText(null);
      refresh();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save the transcript');
    } finally {
      setBusy(null);
    }
  }

  async function evaluate(transcriptId: string) {
    setBusy(`evaluate-${transcriptId}`);
    try {
      await api.post(`/transcripts/${transcriptId}/evaluate`);
      toast.success('Transcript evaluated. Check the Review tab for flags and the recommendation.');
      refresh();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Evaluation failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Interviews</h2>
          <p className="text-sm text-muted-foreground">
            Add an interview round, attach its transcript, then evaluate.
          </p>
        </div>
        <Button variant="outline" onClick={() => setCreating((v) => !v)}>
          <Plus aria-hidden />
          Add interview
        </Button>
      </div>

      {creating && (
        <Card id="interview-new-round-card">
          <CardHeader>
            <CardTitle className="text-base">New interview round</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="stage">Stage</Label>
                <Select value={stage} onValueChange={(v) => setStage(String(v))}>
                  <SelectTrigger id="stage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="interviewer">Interviewer</Label>
                <Input
                  id="interviewer"
                  value={interviewer}
                  onChange={(e) => setInterviewer(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={createInterview} disabled={busy === 'create'}>
                {busy === 'create' && <Loader2 className="animate-spin" aria-hidden />}
                Add round {interviews.length + 1}
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {interviews.length === 0 && !creating && (
        <EmptyState
          title="No interviews recorded"
          description="Add an interview round, then paste or upload the Microsoft Teams transcript. HireLens grades the answers against the expected signals from the question set."
        />
      )}

      {interviews.map((interview) => {
        const transcripts = interview.transcripts ?? [];

        return (
          <Card key={interview.id} id={`interview-card-${interview.id}`}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    Round {interview.round} · {interview.stage.replace('_', ' ')}
                  </CardTitle>
                  <CardDescription>
                    {interview.interviewer_name ?? 'Interviewer not recorded'} ·{' '}
                    {new Date(interview.created_at).toLocaleDateString()}
                  </CardDescription>
                </div>
                <Badge variant={interview.status === 'completed' ? 'default' : 'secondary'}>
                  {interview.status}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {transcripts.length === 0 ? (
                transcriptFor === interview.id ? (
                  <div className="space-y-3 rounded-md border p-4">
                    <div className="flex flex-wrap items-end gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`source-${interview.id}`}>Source</Label>
                        <Select
                          value={transcriptSource}
                          onValueChange={(v) => setTranscriptSource(String(v))}
                        >
                          <SelectTrigger id={`source-${interview.id}`} className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="teams">Microsoft Teams</SelectItem>
                            <SelectItem value="zoom">Zoom</SelectItem>
                            <SelectItem value="meet">Google Meet</SelectItem>
                            <SelectItem value="manual">Typed by hand</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <DocumentUpload
                        label="Upload transcript"
                        accept=".vtt,.txt,.docx,.pdf"
                        hint="Teams .vtt export, or any text file."
                        onExtracted={(text) => {
                          const participants = parseTranscript(text).participants;
                          setOriginalTranscriptText(text);
                          setTranscriptText(demo ? redactPii(text, {
                            names: [candidateName, interview.interviewer_name, ...participants],
                          }) : text);
                        }}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => saveTranscript(interview.id)}
                        disabled={busy === `transcript-${interview.id}`}
                      >
                        {busy === `transcript-${interview.id}` && (
                          <Loader2 className="animate-spin" aria-hidden />
                        )}
                        Save transcript
                      </Button>
                      <Button variant="ghost" onClick={() => {
                        setTranscriptFor(null);
                        setTranscriptText('');
                        setOriginalTranscriptText(null);
                      }}>
                        Cancel
                      </Button>
                    </div>

                    <Textarea
                      value={transcriptText}
                      onChange={(e) => setTranscriptText(e.target.value)}
                      rows={12}
                      placeholder={'Paste the transcript here.\n\nSpeaker names are detected from "Name: text" lines or a Teams WEBVTT export.'}
                    />
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTranscriptFor(interview.id);
                      setTranscriptText('');
                      setOriginalTranscriptText(null);
                    }}
                  >
                    Add transcript
                  </Button>
                )
              ) : (
                transcripts.map((transcript) => {
                  const evaluation = evaluationByTranscript.get(transcript.id);

                  return (
                    <div key={transcript.id} className="space-y-4 rounded-md border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm">
                          <p className="font-medium">
                            Transcript · {transcript.source}
                            {transcript.word_count ? ` · ${transcript.word_count} words` : ''}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {transcript.participants?.length
                              ? `Participants: ${transcript.participants.map((p) => maskName(toCamelCase(p), demo) ?? p).join(', ')}`
                              : 'Speakers not identified'}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant={evaluation ? 'outline' : 'default'}
                          onClick={() => evaluate(transcript.id)}
                          disabled={busy === `evaluate-${transcript.id}`}
                        >
                          {busy === `evaluate-${transcript.id}` ? (
                            <Loader2 className="animate-spin" aria-hidden />
                          ) : (
                            <Sparkles aria-hidden />
                          )}
                          {evaluation ? 'Re-evaluate' : 'Evaluate transcript'}
                        </Button>
                      </div>

                      {evaluation && <EvaluationDetail evaluation={evaluation} />}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function EvaluationDetail({ evaluation }: { evaluation: EvaluationRow }) {
  return (
    <div className="space-y-5 border-t pt-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <ScoreBlock label="Overall" value={`${evaluation.overall_rating}/10`} pct={evaluation.overall_rating * 10} />
        <ScoreBlock
          label="Technical"
          value={`${evaluation.technical_assessment.score}/10`}
          pct={evaluation.technical_assessment.score * 10}
        />
        <ScoreBlock
          label="Communication"
          value={`${evaluation.communication_assessment.score}/10`}
          pct={evaluation.communication_assessment.score * 10}
        />
      </div>

      <div>
        <Badge variant={evaluation.recommendation.includes('no_hire') ? 'destructive' : 'default'}>
          {RECOMMENDATION_LABELS[evaluation.recommendation] ?? evaluation.recommendation}
        </Badge>
        {evaluation.rationale && <p className="mt-2 text-sm">{evaluation.rationale}</p>}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 text-sm">
        <div>
          <h4 className="mb-1.5 font-medium">Technical</h4>
          <p className="text-muted-foreground">{evaluation.technical_assessment.notes}</p>
          {evaluation.technical_assessment.evidence?.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {evaluation.technical_assessment.evidence.map((quote, i) => (
                <li key={i} className="border-l-2 pl-2 text-xs italic text-muted-foreground">
                  {quote}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="mb-1.5 font-medium">Communication</h4>
          <p className="text-muted-foreground">{evaluation.communication_assessment.notes}</p>
          {evaluation.communication_assessment.evidence?.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {evaluation.communication_assessment.evidence.map((quote, i) => (
                <li key={i} className="border-l-2 pl-2 text-xs italic text-muted-foreground">
                  {quote}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 text-sm">
        <div>
          <h4 className="mb-1.5 font-medium">Strengths</h4>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {evaluation.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-1.5 font-medium">Weaknesses</h4>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {evaluation.weaknesses.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      </div>

      {evaluation.answer_breakdown?.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium">Answer breakdown</h4>
          <ul className="space-y-3">
            {evaluation.answer_breakdown.map((answer, i) => (
              <li key={i} className="rounded-md bg-muted/40 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{answer.question}</p>
                  <Badge variant={answer.was_asked ? 'secondary' : 'outline'} className="shrink-0">
                    {answer.was_asked ? `${answer.score}/10` : 'Not asked'}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{answer.feedback}</p>
                {answer.signals_hit?.length > 0 && (
                  <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                    Hit: {answer.signals_hit.join(', ')}
                  </p>
                )}
                {answer.signals_missed?.length > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Missed: {answer.signals_missed.join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ScoreBlock({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums">{value}</span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}
