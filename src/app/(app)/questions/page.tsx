import Link from 'next/link';
import { maskName } from '@/lib/utils/mask';
import { getDemoEnabled } from '@/lib/demo/server-store';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/indicators';
import { ButtonLink } from '@/components/shared/button-link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { QUESTION_CATEGORY_LABELS, type QuestionCategory } from '@/types/domain';

export const metadata = { title: 'Question library - HireLens' };

interface LibraryQuestion {
  id: string;
  job_id: string;
  candidate_id: string | null;
  category: QuestionCategory;
  question: string;
  rationale: string | null;
  expected_signals: string[];
  target_skill: string | null;
  difficulty: string | null;
  source: string;
  created_at: string;
  candidates: { full_name: string } | null;
}

const CATEGORIES: QuestionCategory[] = [
  'screening',
  'deep_technical',
  'gap_validation',
  'experience_validation',
];

export default async function QuestionLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; jobId?: string }>;
}) {
  const { category: activeCategory, jobId: activeJobId } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const db = createSupabaseAdminClient();

  const demo = await getDemoEnabled();

  const { data: jobs } = await db
    .from('jobs')
    .select('id, title')
    .order('created_at', { ascending: false });

  const jobIds = (jobs ?? []).map((j) => j.id);
  const jobTitles = new Map((jobs ?? []).map((j) => [j.id, j.title as string]));

  let questions: LibraryQuestion[] = [];

  if (jobIds.length > 0) {
    let query = db
      .from('questions')
      .select(
        'id, job_id, candidate_id, category, question, rationale, expected_signals, target_skill, difficulty, source, created_at, candidates(full_name)'
      )
      .in('job_id', activeJobId && jobIds.includes(activeJobId) ? [activeJobId] : jobIds)
      .eq('is_reusable', true)
      .order('created_at', { ascending: false })
      .limit(200);

    if (activeCategory && CATEGORIES.includes(activeCategory as QuestionCategory)) {
      query = query.eq('category', activeCategory);
    }

    const { data } = await query;
    questions = (data ?? []) as unknown as LibraryQuestion[];
  }

  const buildHref = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    const merged = { category: activeCategory, jobId: activeJobId, ...params };
    for (const [key, value] of Object.entries(merged)) {
      if (value) search.set(key, value);
    }
    const qs = search.toString();
    return qs ? `/questions?${qs}` : '/questions';
  };

  return (
    <>
      <PageHeader
        title="Question library"
        description="Every generated and hand-written question, reusable across candidates."
      />

      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          <ButtonLink
            href={buildHref({ category: undefined })}
            size="sm"
            variant={activeCategory ? 'outline' : 'default'}
          >
            All categories
          </ButtonLink>
          {CATEGORIES.map((c) => (
            <ButtonLink
              key={c}
              href={buildHref({ category: c })}
              size="sm"
              variant={activeCategory === c ? 'default' : 'outline'}
            >
              {QUESTION_CATEGORY_LABELS[c]}
            </ButtonLink>
          ))}
        </div>

        {(jobs ?? []).length > 1 && (
          <div className="flex flex-wrap gap-2">
            <ButtonLink
              href={buildHref({ jobId: undefined })}
              size="xs"
              variant={activeJobId ? 'outline' : 'secondary'}
            >
              All jobs
            </ButtonLink>
            {(jobs ?? []).map((job) => (
              <ButtonLink
                key={job.id}
                href={buildHref({ jobId: job.id })}
                size="xs"
                variant={activeJobId === job.id ? 'secondary' : 'outline'}
              >
                {job.title}
              </ButtonLink>
            ))}
          </div>
        )}
      </div>

      {questions.length === 0 ? (
        <EmptyState
          title="No questions yet"
          description="Analyse a candidate to have the Question Agent draft a set. Everything it produces lands here and can be reused."
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{questions.length} questions</p>

          {questions.map((q) => (
            <Card key={q.id} id={`question-card-${q.id}`}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-sm font-medium leading-snug">{q.question}</CardTitle>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Badge variant="secondary">{QUESTION_CATEGORY_LABELS[q.category]}</Badge>
                    {q.difficulty && (
                      <Badge variant="outline" className="font-normal">
                        {q.difficulty}
                      </Badge>
                    )}
                    {q.source === 'recruiter' && <Badge variant="outline">Yours</Badge>}
                  </div>
                </div>
                <CardDescription className="text-xs">
                  <Link href={`/jobs/${q.job_id}`} className="hover:underline">
                    {jobTitles.get(q.job_id) ?? 'Job'}
                  </Link>
                  {q.candidates?.full_name && (
                    <>
                      {' · written for '}
                      <Link href={`/candidates/${q.candidate_id}`} className="hover:underline">
                        {maskName(q.candidates.full_name, demo)}
                      </Link>
                    </>
                  )}
                  {q.target_skill && ` · targets ${q.target_skill}`}
                </CardDescription>
              </CardHeader>

              {(q.rationale || q.expected_signals.length > 0) && (
                <CardContent className="space-y-2 pt-0">
                  {q.rationale && (
                    <p className="text-xs text-muted-foreground">Why: {q.rationale}</p>
                  )}
                  {q.expected_signals.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {q.expected_signals.map((signal, i) => (
                        <Badge key={i} variant="secondary" className="font-normal">
                          {signal}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
