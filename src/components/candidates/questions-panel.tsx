import { EmptyState } from '@/components/shared/indicators';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { maskName, maskText } from '@/lib/utils/mask';
import {
  QUESTION_CATEGORY_LABELS,
  type QuestionCategory,
  type QuestionSetRow,
} from '@/types/domain';

const CATEGORY_ORDER: QuestionCategory[] = [
  'screening',
  'deep_technical',
  'gap_validation',
  'experience_validation',
];

const CATEGORY_HINTS: Record<QuestionCategory, string> = {
  screening: 'Quick role-fit check.',
  deep_technical: 'Trade-offs and decisions on the technologies this role needs.',
  gap_validation: 'Establishes whether an identified gap is real or simply unstated.',
  experience_validation: 'Verifies the claimed work is genuinely the candidate\u2019s own.',
};

export function QuestionsPanel({
  sets,
  candidateName,
  demo,
}: {
  sets: QuestionSetRow[];
  candidateName: string;
  demo: boolean;
}) {
  if (sets.length === 0) {
    return (
      <EmptyState
        title="No question set yet"
        description="Run Analyse candidate. The Question Agent drafts screening, deep technical, gap validation and experience validation questions targeted at this specific candidate."
      />
    );
  }

  const [latest, ...previous] = sets;

  return (
    <div className="space-y-8">
      <QuestionSet set={latest} isLatest candidateName={candidateName} demo={demo} />
      {previous.length > 0 && (
        <section id="questions-earlier-sets-section">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Earlier sets ({previous.length})
          </h2>
          <div className="space-y-6">
            {previous.map((set) => (
              <QuestionSet key={set.id} set={set} candidateName={candidateName} demo={demo} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function QuestionSet({
  set,
  isLatest = false,
  candidateName,
  demo,
}: {
  set: QuestionSetRow;
  isLatest?: boolean;
  candidateName: string;
  demo: boolean;
}) {
  const questions = set.questions ?? [];
  // Labels are stored as "{candidate name} - {job title}". In demo mode the name
  // segment is masked outright so any stored form of it (middle names, casing)
  // is covered, not just an exact full_name match.
  const separator = ' - ';
  const sepIndex = set.label.indexOf(separator);
  const label = !demo
    ? set.label
    : sepIndex === -1
      ? (maskText(set.label, candidateName, true) ?? set.label)
      : `${maskName(set.label.slice(0, sepIndex), true) ?? ''}${set.label.slice(sepIndex)}`;
  const notes = maskText(set.notes, candidateName, demo);

  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: questions
      .filter((q) => q.category === category)
      .sort((a, b) => a.sort_order - b.sort_order),
  })).filter((g) => g.items.length > 0);

  return (
    <Card id={`question-set-${set.id}`}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{label}</CardTitle>
            <CardDescription>
              {questions.length} questions · {new Date(set.created_at).toLocaleString()}
              {notes ? ` · ${notes}` : ''}
            </CardDescription>
          </div>
          {isLatest && <Badge>Current</Badge>}
        </div>
      </CardHeader>

      <CardContent className="space-y-8">
        {grouped.map(({ category, items }) => (
          <section key={category} id={`question-set-${set.id}-${category}`}>
            <h3 className="text-sm font-semibold">{QUESTION_CATEGORY_LABELS[category]}</h3>
            <p className="mb-3 text-xs text-muted-foreground">{CATEGORY_HINTS[category]}</p>

            <ol className="space-y-4">
              {items.map((q, index) => (
                <li key={q.id} className="rounded-md border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">
                      {index + 1}. {maskText(q.question, candidateName, demo)}
                    </p>
                    <div className="flex shrink-0 gap-1.5">
                      {q.difficulty && (
                        <Badge variant="outline" className="font-normal">
                          {q.difficulty}
                        </Badge>
                      )}
                      {q.source === 'recruiter' && <Badge variant="secondary">Yours</Badge>}
                    </div>
                  </div>

                  {q.rationale && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Why: {maskText(q.rationale, candidateName, demo)}
                    </p>
                  )}

                  {q.expected_signals.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-xs font-medium">Look for</p>
                      <div className="flex flex-wrap gap-1">
                        {q.expected_signals.map((signal, i) => (
                          <Badge key={i} variant="secondary" className="font-normal">
                            {maskText(signal, candidateName, demo)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
