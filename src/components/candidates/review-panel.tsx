'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api/client';
import { EmptyState, FlagBadge } from '@/components/shared/indicators';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FLAG_CATEGORY_LABELS,
  RECOMMENDATION_LABELS,
  type EvaluationRow,
  type FeedbackRow,
  type FlagRowFull,
} from '@/types/domain';

const DECISIONS = [
  ['advance', 'Advance to next round'],
  ['hold', 'Hold for now'],
  ['hire', 'Hire'],
  ['reject', 'Reject'],
] as const;

export function ReviewPanel({
  candidateId,
  candidateStatus,
  flags,
  evaluations,
  feedback,
}: {
  candidateId: string;
  candidateStatus: string;
  flags: FlagRowFull[];
  evaluations: EvaluationRow[];
  feedback: FeedbackRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const latestEvaluation = evaluations[0] ?? null;
  const agentRecommendation = latestEvaluation?.recommendation ?? null;

  const [decision, setDecision] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [verifiedGaps, setVerifiedGaps] = useState('');
  const [busy, setBusy] = useState(false);

  const openFlags = flags.filter((f) => f.status === 'open');
  const hasOpenRed = openFlags.some((f) => f.level === 'RED');

  // "Accept" means the human agreed with what the agent recommended.
  const agentImpliedDecision =
    agentRecommendation === null
      ? null
      : agentRecommendation.includes('no_hire')
        ? 'reject'
        : agentRecommendation === 'strong_hire'
          ? 'hire'
          : 'advance';

  async function submit() {
    if (!decision) {
      toast.error('Choose a decision');
      return;
    }
    if (notes.trim().length < 10) {
      toast.error('Record why you reached this decision (at least 10 characters)');
      return;
    }

    setBusy(true);
    try {
      await api.post('/review', {
        candidate_id: candidateId,
        evaluation_id: latestEvaluation?.id ?? null,
        decision: decision === agentImpliedDecision ? 'accept' : 'override',
        agent_recommendation: agentRecommendation,
        final_decision: decision,
        notes: notes.trim(),
        verified_gaps: verifiedGaps
          .split(/\r?\n/)
          .map((gap) => gap.trim())
          .filter(Boolean),
        resolve_flags: true,
      });

      toast.success('Decision recorded and added to the knowledge base');
      setNotes('');
      setVerifiedGaps('');
      setDecision('');
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not record the decision');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card id="review-flags-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" aria-hidden />
              Red flag review
            </CardTitle>
            <CardDescription>
              Advisory only. HireLens never rejects a candidate; you decide.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {flags.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No flag check has run yet. Evaluate an interview transcript first.
              </p>
            ) : (
              <ul className="space-y-4">
                {flags.map((flag) => (
                  <li key={flag.id} className="rounded-md border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FlagBadge level={flag.level} />
                        <span className="text-sm font-medium">
                          {FLAG_CATEGORY_LABELS[flag.category] ?? flag.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {flag.confidence !== null && (
                          <span className="text-xs text-muted-foreground">
                            confidence {flag.confidence}
                          </span>
                        )}
                        <Badge variant={flag.status === 'open' ? 'secondary' : 'outline'}>
                          {flag.status}
                        </Badge>
                      </div>
                    </div>

                    <p className="mt-2 text-sm">{flag.reason}</p>

                    {flag.evidence?.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {flag.evidence.map((item, i) => (
                          <li key={i} className="border-l-2 pl-2 text-xs text-muted-foreground">
                            <span className="font-medium uppercase">{item.source}</span>:{' '}
                            <span className="italic">{item.quote}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {feedback.length > 0 && (
          <Card id="review-decision-history-card">
            <CardHeader>
              <CardTitle className="text-base">Decision history</CardTitle>
              <CardDescription>
                Every accept and override is stored and becomes retrievable precedent.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                {feedback.map((entry) => (
                  <li key={entry.id} className="border-l-2 pl-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={entry.decision === 'override' ? 'secondary' : 'outline'}>
                        {entry.decision === 'override' ? 'Overrode agent' : 'Accepted agent'}
                      </Badge>
                      <span className="text-sm font-medium">
                        {entry.final_decision.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                    {entry.agent_recommendation && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Agent had recommended:{' '}
                        {RECOMMENDATION_LABELS[entry.agent_recommendation] ??
                          entry.agent_recommendation}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-muted-foreground">{entry.notes}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <Card id="review-decision-card">
          <CardHeader>
            <CardTitle className="text-base">Your decision</CardTitle>
            <CardDescription>
              Current status: {candidateStatus.replace('_', ' ')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {agentRecommendation && (
              <Alert>
                <AlertTitle className="text-sm">Agent recommendation</AlertTitle>
                <AlertDescription>
                  {RECOMMENDATION_LABELS[agentRecommendation] ?? agentRecommendation}
                  {latestEvaluation && ` · ${latestEvaluation.overall_rating}/10 overall`}
                </AlertDescription>
              </Alert>
            )}

            {hasOpenRed && (
              <Alert variant="destructive">
                <AlertTitle className="text-sm">Unresolved RED flag</AlertTitle>
                <AlertDescription>
                  Resolve the flagged inconsistency before advancing this candidate.
                </AlertDescription>
              </Alert>
            )}

            {!latestEvaluation && flags.length === 0 && (
              <EmptyState
                title="Nothing to review yet"
                description="Evaluate an interview transcript to generate a recommendation and flag check."
              />
            )}

            <div className="space-y-2">
              <Label htmlFor="decision">Decision</Label>
              <Select value={decision} onValueChange={(v) => setDecision(String(v))}>
                <SelectTrigger id="decision">
                  <SelectValue placeholder="Select a decision" />
                </SelectTrigger>
                <SelectContent>
                  {DECISIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                      {value === agentImpliedDecision ? ' (agent agrees)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="verified-gaps">Expert-verified gaps</Label>
              <Textarea
                id="verified-gaps"
                value={verifiedGaps}
                onChange={(e) => setVerifiedGaps(e.target.value)}
                rows={4}
                placeholder={'One verified gap per line. These become retrievable evidence for future cases.'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Reasoning</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={7}
                placeholder="Why did you reach this decision? This is stored and retrieved as precedent for future candidates."
              />
              <p className="text-xs text-muted-foreground">{notes.trim().length}/10 minimum</p>
            </div>

            <Button
              className="w-full"
              onClick={submit}
              disabled={busy || !decision || notes.trim().length < 10}
            >
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Record decision
            </Button>

            {decision && agentImpliedDecision && decision !== agentImpliedDecision && (
              <p className="text-xs text-muted-foreground">
                This will be recorded as an override of the agent&apos;s recommendation.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
