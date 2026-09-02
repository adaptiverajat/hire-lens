'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/indicators';
import { maskName, maskEmail, toCamelCase } from '@/lib/utils/mask';
import {
  RECOMMENDATION_LABELS,
  type EvaluationRow,
  type FeedbackRow,
  type FlagRowFull,
} from '@/types/domain';

interface ExportCandidate {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  headline: string | null;
  total_years_experience: number | null;
  status: string;
  created_at: string;
  hasTranscript: boolean;
  evaluations: EvaluationRow[];
  flags: FlagRowFull[];
  feedback: FeedbackRow[];
}

interface ExportJob {
  id: string;
  title: string;
  status: string;
  candidates: ExportCandidate[];
}

interface PageJob {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

interface PageCandidate {
  id: string;
  full_name: string;
  email: string | null;
  status: string;
  job_id: string;
  total_years_experience: number | null;
  created_at: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildPostInterviewHtml(
  jobs: ExportJob[],
  selectedIds: Set<string>,
  demo: boolean,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Post-Interview Report</title>
<style>
${REPORT_STYLES}
</style>
</head>
<body>
${buildPostInterviewBody(jobs, selectedIds, demo)}
</body>
</html>`;
}

function buildPostInterviewBody(
  jobs: ExportJob[],
  selectedIds: Set<string>,
  demo: boolean,
): string {
  const jobTables: string[] = [];

  for (const job of jobs) {
    const jobCandidates = job.candidates.filter((c) => selectedIds.has(c.id));
    if (jobCandidates.length === 0) continue;

    const rows = jobCandidates.map((c) => {
      const name = escapeHtml(maskName(toCamelCase(c.full_name), demo) ?? c.full_name);
      const email = c.email ? escapeHtml(c.email) : '';
      const years = c.total_years_experience !== null ? `${c.total_years_experience} yrs` : '';
      const contact = [email, years].filter(Boolean).join(' · ');

      // Determine final decision or current status
      const latestFeedback = c.feedback[0] ?? null;
      const latestEval = c.evaluations[0] ?? null;

      let decision: string;
      let decisionColor: string;
      let decisionSource: string;
      let detail: string;

      // Camel-case a decision string
      const camel = (s: string) =>
        s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      // Determine color: red for reject, green for advance/selected/hire (not lean hire), orange for anything else
      const colorFor = (d: string): string => {
        const lower = d.toLowerCase();
        if (lower.includes('reject') || lower.includes('no hire')) return 'red';
        if (lower.includes('lean hire')) return 'orange';
        if (lower.includes('advance') || lower.includes('selected') || lower.includes('hire')) return 'green';
        return 'orange';
      };

      if (latestFeedback) {
        // Rename 'advance' to 'Selected', anything else non-reject becomes 'On Hold'
        const rawDecision = latestFeedback.final_decision;
        decisionColor = colorFor(rawDecision);
        decision = rawDecision === 'advance'
          ? 'Selected'
          : decisionColor === 'red'
            ? camel(rawDecision)
            : 'On Hold';
        decisionSource = 'Human review';
        let notes = latestFeedback.notes ? escapeHtml(latestFeedback.notes) : '';
        // Truncate notes to ~50 words
        if (notes) {
          const words = notes.split(/\s+/);
          if (words.length > 50) notes = words.slice(0, 50).join(' ') + '…';
        }
        detail = notes || '';
      } else if (latestEval) {
        const rec = latestEval.recommendation
          ? RECOMMENDATION_LABELS[latestEval.recommendation] ?? camel(latestEval.recommendation)
          : 'Not Set';
        decisionColor = colorFor(rec);
        decision = decisionColor === 'orange' ? 'On Hold' : rec;
        decisionSource = 'Agent';
        let rationale = latestEval.rationale ? escapeHtml(latestEval.rationale) : '';
        // Truncate rationale to ~50 words
        if (rationale) {
          const words = rationale.split(/\s+/);
          if (words.length > 50) rationale = words.slice(0, 50).join(' ') + '…';
        }
        detail = rationale;
      } else {
        decisionColor = colorFor(c.status);
        decision = decisionColor === 'orange' ? 'On Hold' : camel(c.status);
        decisionSource = 'Current status';
        detail = escapeHtml('No transcript evaluation or human review yet.');
      }

      // Rating from the latest evaluation
      const rating = latestEval ? `${latestEval.overall_rating}/10` : '-';

      // Inline styles for decision badges — email clients strip <style> blocks
      const DECISION_STYLES: Record<string, string> = {
        red: 'background:#fee2e2;color:#991b1b;',
        green: 'background:#d1fae5;color:#065f46;',
        orange: 'background:#fed7aa;color:#9a3412;',
      };
      const badgeStyle = `display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:3px;${DECISION_STYLES[decisionColor] ?? DECISION_STYLES.orange}`;
      const srcStyle = 'font-size:10px;color:#9ca3af;';

      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${name}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${escapeHtml(contact)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;vertical-align:top;"><span style="${badgeStyle}">${escapeHtml(decision)}</span><br/><span style="${srcStyle}">${escapeHtml(decisionSource)}</span></td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${detail}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">${escapeHtml(rating)}</td>
      </tr>`;
    }).join('');

    const isFirst = jobTables.length === 0;
    const thStyle = 'text-align:left;padding:6px 8px;background:#f9fafb;border-bottom:2px solid #e5e7eb;font-size:11px;text-transform:uppercase;color:#6b7280;';
    jobTables.push(`
      <div${isFirst ? '' : ' style="page-break-before:always;"'}>
        <h2 style="font-size:15px;margin-top:24px;margin-bottom:8px;border-bottom:2px solid #e5e7eb;padding-bottom:3px;">${escapeHtml(job.title)}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
        <thead>
          <tr>
            <th style="${thStyle}">Candidate</th>
            <th style="${thStyle}">Contact</th>
            <th style="${thStyle}">Decision</th>
            <th style="${thStyle}">Reasoning / Notes</th>
            <th style="${thStyle}">Rating</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      </div>
    `);
  }

  return `<h1 style="font-size:20px;margin-bottom:4px;">Post-Interview Report</h1>
  <p style="font-size:11px;color:#6b7280;margin-bottom:16px;">Generated: ${new Date().toLocaleString()}</p>
  ${jobTables.join('')}`;
}

const REPORT_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #1a1a1a;
    line-height: 1.5;
    padding: 30px;
    max-width: 1100px;
    margin: 0 auto;
  }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 {
    font-size: 15px;
    margin-top: 24px;
    margin-bottom: 8px;
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 3px;
  }
  .meta { font-size: 11px; color: #6b7280; margin-bottom: 16px; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin-bottom: 16px;
  }
  th {
    text-align: left;
    padding: 6px 8px;
    background: #f9fafb;
    border-bottom: 2px solid #e5e7eb;
    font-size: 11px;
    text-transform: uppercase;
    color: #6b7280;
  }
  td {
    padding: 8px;
    border-bottom: 1px solid #e5e7eb;
    vertical-align: top;
  }
  td .src { font-size: 10px; color: #9ca3af; }
  .decision {
    display: inline-block;
    font-size: 12px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 3px;
  }
  .decision-red { background: #fee2e2; color: #991b1b; }
  .decision-green { background: #d1fae5; color: #065f46; }
  .decision-orange { background: #fed7aa; color: #9a3412; }
  @media print {
    body { padding: 15px; }
    @page { margin: 1cm; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
    .page-break { page-break-before: always; }
  }
`;

function buildPostInterviewText(
  jobs: ExportJob[],
  selectedIds: Set<string>,
  demo: boolean,
): string {
  const lines: string[] = ['Post-Interview Report', `Generated: ${new Date().toLocaleString()}`, ''];

  for (const job of jobs) {
    const jobCandidates = job.candidates.filter((c) => selectedIds.has(c.id));
    if (jobCandidates.length === 0) continue;

    lines.push(job.title);
    lines.push('-'.repeat(job.title.length));

    for (const c of jobCandidates) {
      const name = maskName(toCamelCase(c.full_name), demo) ?? c.full_name;
      const email = c.email ?? '';
      const years = c.total_years_experience !== null ? `${c.total_years_experience} yrs` : '';
      const contact = [email, years].filter(Boolean).join(', ');

      const latestFeedback = c.feedback[0] ?? null;
      const latestEval = c.evaluations[0] ?? null;

      const camel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
      const colorFor = (d: string): string => {
        const lower = d.toLowerCase();
        if (lower.includes('reject') || lower.includes('no hire')) return 'red';
        if (lower.includes('lean hire')) return 'orange';
        if (lower.includes('advance') || lower.includes('selected') || lower.includes('hire')) return 'green';
        return 'orange';
      };

      let decision: string;
      let decisionSource: string;
      let detail: string;

      if (latestFeedback) {
        const rawDecision = latestFeedback.final_decision;
        const color = colorFor(rawDecision);
        decision = rawDecision === 'advance' ? 'Selected' : color === 'red' ? camel(rawDecision) : 'On Hold';
        decisionSource = 'Human review';
        let notes = latestFeedback.notes ?? '';
        const words = notes.split(/\s+/);
        if (words.length > 50) notes = words.slice(0, 50).join(' ') + '...';
        detail = notes || '';
      } else if (latestEval) {
        const rec = latestEval.recommendation
          ? RECOMMENDATION_LABELS[latestEval.recommendation] ?? camel(latestEval.recommendation)
          : 'Not Set';
        const color = colorFor(rec);
        decision = color === 'orange' ? 'On Hold' : rec;
        decisionSource = 'Agent';
        let rationale = latestEval.rationale ?? '';
        const words = rationale.split(/\s+/);
        if (words.length > 50) rationale = words.slice(0, 50).join(' ') + '...';
        detail = rationale;
      } else {
        const color = colorFor(c.status);
        decision = color === 'orange' ? 'On Hold' : camel(c.status);
        decisionSource = 'Current status';
        detail = 'No transcript evaluation or human review yet.';
      }

      const rating = latestEval ? `${latestEval.overall_rating}/10` : '-';

      lines.push(`  ${name} (${contact})`);
      lines.push(`    Decision: ${decision} [${decisionSource}]`);
      lines.push(`    Reasoning: ${detail}`);
      lines.push(`    Rating: ${rating}`);
      lines.push('');
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function CandidatesListWithExport({
  jobs,
  candidates,
  exportJobs,
  demo,
}: {
  jobs: PageJob[];
  candidates: PageCandidate[];
  exportJobs: ExportJob[];
  demo: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const candidatesByJob = useMemo(() => {
    const map = new Map<string, PageCandidate[]>();
    for (const c of candidates) {
      const list = map.get(c.job_id) ?? [];
      list.push(c);
      map.set(c.job_id, list);
    }
    return map;
  }, [candidates]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    if (selected.size === 0) {
      alert('Please select at least one candidate by checking the boxes on the candidate cards before exporting.');
      return;
    }
    const bodyHtml = buildPostInterviewBody(exportJobs, selected, demo);
    const plainText = buildPostInterviewText(exportJobs, selected, demo);

    // Open a hidden window with the rendered HTML, select all, and copy — this
    // preserves inline styles (colors) better than the ClipboardItem API.
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Copying...</title></head><body style="font-family:sans-serif;">${bodyHtml}</body></html>`);
      win.document.close();
      // Wait for render, then select all + copy
      win.setTimeout(() => {
        win.focus();
        win.document.execCommand('selectAll');
        win.document.execCommand('copy');
        win.close();
      }, 200);
    }

    // Also try ClipboardItem API as a backup
    try {
      if (navigator.clipboard && typeof navigator.clipboard.write === 'function') {
        const htmlBlob = new Blob([bodyHtml], { type: 'text/html' });
        const textBlob = new Blob([plainText], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob }),
        ]);
      }
    } catch {
      // Clipboard API may fail — the window-based copy above is the primary method
    }

    // Open mailto with subject and plain-text body pre-filled
    const subject = encodeURIComponent('Post-Interview Report');
    const body = encodeURIComponent(plainText);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <>
      {/* Sticky export bar — always visible, shows count when candidates are selected */}
      <div
        id="post-interview-export-bar"
        className="sticky top-0 z-50 mb-4 flex items-center justify-between rounded-md border bg-background px-4 py-2 shadow-md"
      >
        <span className="text-sm font-medium">
          {selected.size > 0
            ? `${selected.size} candidate${selected.size === 1 ? '' : 's'} selected`
            : 'Select candidates below to include in the report'}
        </span>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              <X className="size-4" />
              Clear
            </Button>
          )}
          <Button size="sm" onClick={handleExport}>
            <Download className="size-4" />
            Email Candidate Status
          </Button>
        </div>
      </div>

      <div className="space-y-8">
        {jobs.map((job) => {
          const jobCandidates = candidatesByJob.get(job.id) ?? [];
          if (jobCandidates.length === 0) return null;
          return (
            <section key={job.id} id={`candidates-job-section-${job.id}`}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={jobCandidates.length > 0 && jobCandidates.every((c) => selected.has(c.id))}
                    onCheckedChange={(checked) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (checked) {
                          for (const c of jobCandidates) next.add(c.id);
                        } else {
                          for (const c of jobCandidates) next.delete(c.id);
                        }
                        return next;
                      });
                    }}
                    aria-label={`Select all candidates for ${job.title}`}
                  />
                  <h2 className="text-lg font-semibold">
                    <Link href={`/jobs/${job.id}`} className="hover:underline">
                      {job.title}
                    </Link>
                  </h2>
                  <StatusBadge status={job.status} />
                </div>
                <span className="text-sm text-muted-foreground">
                  {jobCandidates.length} candidate{jobCandidates.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {jobCandidates.map((c) => (
                  <div key={c.id} className="relative">
                    <div className="absolute left-4 top-5 z-10">
                      <Checkbox
                        checked={selected.has(c.id)}
                        onCheckedChange={() => toggle(c.id)}
                        aria-label={`Select ${c.full_name} for export`}
                      />
                    </div>
                    <Link href={`/candidates/${c.id}`} className="block">
                      <Card
                        id={`candidate-card-${c.id}`}
                        className={`transition-colors hover:ring-foreground/20 ${
                          selected.has(c.id) ? 'ring-2 ring-primary' : ''
                        }`}
                      >
                        <CardHeader className="pb-2 pl-10 pt-[10px]">
                          <CardTitle className="text-base">
                            {maskName(c.full_name, demo) ?? 'Unnamed candidate'}
                          </CardTitle>
                          <CardDescription className="truncate">
                            {maskEmail(c.email, demo) ?? 'No email'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="py-3 pl-10 pt-[10px]">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-muted-foreground">
                              {c.total_years_experience !== null
                                ? `${c.total_years_experience} yrs exp`
                                : 'Experience n/a'}
                            </span>
                            <StatusBadge status={c.status} />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
