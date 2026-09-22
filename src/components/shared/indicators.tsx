import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Evidence-weighted match score 0-100. Colour bands are deliberately coarse. */
export function ScoreBadge({ score, label = 'evidence match' }: { score: number | null; label?: string }) {
  if (score === null) {
    return <Badge variant="outline">Not analysed</Badge>;
  }

  const tone =
    score >= 75
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
      : score >= 50
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300';

  return (
    <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', tone)}>
      {score}% {label}
    </span>
  );
}

export function FlagBadge({ level }: { level: 'GREEN' | 'YELLOW' | 'RED' | null }) {
  if (!level) return <Badge variant="outline">Not assessed</Badge>;

  const map = {
    GREEN: ['Clear', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'],
    YELLOW: ['Needs follow-up', 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'],
    RED: ['Must resolve', 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'],
  } as const;

  const [text, tone] = map[level];
  return (
    <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', tone)}>
      {level} - {text}
    </span>
  );
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  screening: 'Screening',
  interviewing: 'Interviewing',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
  on_hold: 'On hold',
  draft: 'Draft',
  open: 'Open',
  closed: 'Closed',
  pending: 'Pending',
  processing: 'Processing',
  complete: 'Complete',
  failed: 'Failed',
};

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;

  if (status === 'open') {
    return (
      <Badge variant="outline" className="bg-emerald-100 !border-emerald-200 !text-emerald-800">
        {STATUS_LABELS.open}
      </Badge>
    );
  }

  const variant =
    status === 'rejected' || status === 'failed'
      ? 'destructive'
      : status === 'hired' || status === 'complete'
        ? 'default'
        : 'secondary';

  return <Badge variant={variant}>{STATUS_LABELS[status] ?? status}</Badge>;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  id,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  id?: string;
}) {
  return (
    <Card id={id}>
      <CardContent className="flex items-start justify-between gap-3 pt-6">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <h3 className="font-medium">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
