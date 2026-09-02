import Link from 'next/link';
import { maskName } from '@/lib/utils/mask';
import { getDemoEnabled } from '@/lib/demo/server-store';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, FlagBadge } from '@/components/shared/indicators';
import { ButtonLink } from '@/components/shared/button-link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { FLAG_CATEGORY_LABELS } from '@/types/domain';

export const metadata = { title: 'Review queue - HireLens' };

interface QueueFlag {
  id: string;
  job_id: string;
  candidate_id: string;
  level: 'GREEN' | 'YELLOW' | 'RED';
  category: string;
  reason: string;
  evidence: Array<{ source: string; quote: string }>;
  confidence: number | null;
  status: string;
  created_at: string;
  candidates: { full_name: string; status: string } | null;
}

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeStatus = status ?? 'open';

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const db = createSupabaseAdminClient();

  const demo = await getDemoEnabled();

  const { data: jobs } = await db.from('jobs').select('id, title').eq('created_by', user!.id);
  const jobIds = (jobs ?? []).map((j) => j.id);
  const jobTitles = new Map((jobs ?? []).map((j) => [j.id, j.title as string]));

  let flags: QueueFlag[] = [];

  if (jobIds.length > 0) {
    let query = db
      .from('flags')
      .select(
        'id, job_id, candidate_id, level, category, reason, evidence, confidence, status, created_at, candidates(full_name, status)'
      )
      .in('job_id', jobIds)
      .order('created_at', { ascending: false })
      .limit(200);

    if (activeStatus !== 'all') query = query.eq('status', activeStatus);

    const { data } = await query;
    flags = (data ?? []) as unknown as QueueFlag[];
  }

  // RED first, then YELLOW, then GREEN.
  const severity = { RED: 0, YELLOW: 1, GREEN: 2 } as const;
  flags.sort((a, b) => severity[a.level] - severity[b.level]);

  const redCount = flags.filter((f) => f.level === 'RED' && f.status === 'open').length;

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Flags raised by the Red Flag Agent. Nothing is auto-rejected; every item needs a human decision."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            ['open', 'Open'],
            ['resolved', 'Resolved'],
            ['all', 'All'],
          ] as const
        ).map(([value, label]) => (
          <ButtonLink
            key={value}
            href={value === 'open' ? '/review' : `/review?status=${value}`}
            size="sm"
            variant={activeStatus === value ? 'default' : 'outline'}
          >
            {label}
          </ButtonLink>
        ))}
      </div>

      {redCount > 0 && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>
            {redCount} RED flag{redCount === 1 ? '' : 's'} must be resolved before those candidates
            can advance.
          </AlertDescription>
        </Alert>
      )}

      {flags.length === 0 ? (
        <EmptyState
          title={activeStatus === 'open' ? 'Queue is clear' : 'Nothing to show'}
          description={
            activeStatus === 'open'
              ? 'No open flags. New ones appear here whenever a transcript evaluation finds an inconsistency.'
              : 'Try a different filter.'
          }
        />
      ) : (
        <div className="space-y-4">
          {flags.map((flag) => (
            <Card key={flag.id} id={`flag-card-${flag.id}`}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      <Link href={`/candidates/${flag.candidate_id}`} className="hover:underline">
                        {flag.candidates?.full_name ? maskName(flag.candidates.full_name, demo) : 'Candidate'}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      {jobTitles.get(flag.job_id)} ·{' '}
                      {FLAG_CATEGORY_LABELS[flag.category] ?? flag.category} ·{' '}
                      {new Date(flag.created_at).toLocaleDateString()}
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <FlagBadge level={flag.level} />
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
              </CardHeader>

              <CardContent className="space-y-3 pt-0">
                <p className="text-sm">{flag.reason}</p>

                {flag.evidence?.length > 0 && (
                  <ul className="space-y-1.5">
                    {flag.evidence.map((item, i) => (
                      <li key={i} className="border-l-2 pl-2 text-xs text-muted-foreground">
                        <span className="font-medium uppercase">{item.source}</span>:{' '}
                        <span className="italic">{item.quote}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <ButtonLink href={`/candidates/${flag.candidate_id}`} size="sm" variant="outline">
                  Open to decide
                </ButtonLink>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
