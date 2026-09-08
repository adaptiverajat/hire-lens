'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { displaySkill } from '@/lib/domain/skills';
import {
  QUESTION_CATEGORY_LABELS,
  type CandidateRow,
  type JobRow,
  type MatchAnalysisRow,
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildExportHtml(
  candidate: CandidateRow,
  job: JobRow,
  analysis: MatchAnalysisRow | null,
  questionSets: QuestionSetRow[],
): string {
  const name = escapeHtml(candidate.full_name || 'Unknown candidate');
  const headline = candidate.headline ? escapeHtml(candidate.headline) : '';
  const email = candidate.email ? escapeHtml(candidate.email) : '';
  const phone = candidate.phone ? escapeHtml(candidate.phone) : '';
  const location = candidate.location ? escapeHtml(candidate.location) : '';
  const years = candidate.total_years_experience !== null
    ? `${candidate.total_years_experience} years experience`
    : '';
  const jobTitle = escapeHtml(job.title);
  const department = job.department ? escapeHtml(job.department) : '';
  const seniority = job.seniority ? escapeHtml(job.seniority) : '';

  const contactLine = [email, phone, location, years].filter(Boolean).join(' · ');

  // Match analysis section
  let analysisHtml = '';
  if (analysis) {
    const score = analysis.match_score;
    const verdict = analysis.verdict ? escapeHtml(analysis.verdict.replace(/_/g, ' ')) : '';
    const summary = analysis.summary ? escapeHtml(analysis.summary) : '';

    const strongAreas = analysis.strong_skills.length > 0
      ? `<ul>${analysis.strong_skills.map((s) =>
          `<li><strong>${escapeHtml(displaySkill(s.skill))}</strong><br/>${escapeHtml(s.evidence)}</li>`
        ).join('')}</ul>`
      : '<p>None identified.</p>';

    const gaps = analysis.missing_skills.length > 0
      ? `<ul>${analysis.missing_skills.map((s) =>
          `<li>${escapeHtml(displaySkill(s.skill))} <span class="badge ${s.severity === 'high' ? 'badge-high' : 'badge-low'}">${escapeHtml(s.severity)}</span></li>`
        ).join('')}</ul>`
      : '<p>No mandatory requirements are missing.</p>';

    analysisHtml = `
      <h2>Match Analysis</h2>
      <div class="score-box">
        <span class="score">${score}%</span>
        ${verdict ? `<span class="verdict">${verdict}</span>` : ''}
      </div>
      ${summary ? `<p class="summary">${summary}</p>` : ''}

      <h3>Strong Areas</h3>
      ${strongAreas}

      <h3>Gaps</h3>
      ${gaps}
    `;
  } else {
    analysisHtml = '<h2>Match Analysis</h2><p>Not analysed yet.</p>';
  }

  // Interview questions section
  let questionsHtml = '';
  if (questionSets.length > 0) {
    const latest = questionSets[0];
    const questions = latest.questions ?? [];
    const grouped = CATEGORY_ORDER.map((category) => ({
      category,
      items: questions
        .filter((q) => q.category === category)
        .sort((a, b) => a.sort_order - b.sort_order),
    })).filter((g) => g.items.length > 0);

    questionsHtml = '<h2>Interview Questions</h2>';
    questionsHtml += `<p class="set-label">${escapeHtml(latest.label)} · ${questions.length} questions</p>`;

    for (const { category, items } of grouped) {
      questionsHtml += `<h3>${escapeHtml(QUESTION_CATEGORY_LABELS[category])}</h3>`;
      questionsHtml += `<p class="hint">${escapeHtml(CATEGORY_HINTS[category])}</p>`;
      questionsHtml += '<ol>';
      for (let i = 0; i < items.length; i++) {
        const q = items[i];
        questionsHtml += `<li>`;
        questionsHtml += `<p class="q-text"><strong>${i + 1}.</strong> ${escapeHtml(q.question)}</p>`;
        if (q.rationale) {
          questionsHtml += `<p class="q-rationale">Why: ${escapeHtml(q.rationale)}</p>`;
        }
        if (q.expected_signals.length > 0) {
          questionsHtml += `<p class="look-for"><strong>Look for:</strong> ${q.expected_signals.map((s) => escapeHtml(s)).join(', ')}</p>`;
        }
        questionsHtml += `</li>`;
      }
      questionsHtml += '</ol>';
    }
  } else {
    questionsHtml = '<h2>Interview Questions</h2><p>No question set generated yet.</p>';
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${name} — Candidate Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #1a1a1a;
    line-height: 1.6;
    padding: 40px;
    max-width: 800px;
    margin: 0 auto;
  }
  h1 { font-size: 24px; margin-bottom: 4px; }
  h2 {
    font-size: 18px;
    margin-top: 32px;
    margin-bottom: 12px;
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 4px;
  }
  h3 { font-size: 14px; margin-top: 20px; margin-bottom: 8px; color: #374151; }
  p { font-size: 13px; margin-bottom: 8px; }
  .header { margin-bottom: 24px; }
  .header .contact { font-size: 12px; color: #6b7280; margin-top: 4px; }
  .job-line {
    font-size: 14px;
    background: #f3f4f6;
    padding: 10px 14px;
    border-radius: 6px;
    margin-bottom: 8px;
  }
  .job-line strong { color: #111827; }
  .score-box {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 12px;
  }
  .score { font-size: 32px; font-weight: 700; }
  .verdict {
    font-size: 13px;
    color: #6b7280;
    text-transform: capitalize;
  }
  .summary { color: #374151; margin-bottom: 16px; }
  ul { list-style: disc; padding-left: 20px; margin-bottom: 12px; }
  ul li { font-size: 13px; margin-bottom: 6px; }
  ol { list-style: decimal; padding-left: 20px; margin-bottom: 12px; }
  ol li { font-size: 13px; margin-bottom: 12px; padding-left: 4px; }
  .q-text { font-weight: 500; margin-bottom: 4px; }
  .q-rationale { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
  .look-for { font-size: 12px; color: #374151; }
  .look-for strong { font-size: 12px; }
  .set-label { font-size: 12px; color: #6b7280; margin-bottom: 12px; }
  .hint { font-size: 11px; color: #9ca3af; font-style: italic; margin-bottom: 8px; }
  .badge {
    display: inline-block;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    text-transform: uppercase;
    font-weight: 600;
  }
  .badge-high { background: #fee2e2; color: #991b1b; }
  .badge-low { background: #e5e7eb; color: #374151; }
  @media print {
    body { padding: 20px; }
    @page { margin: 1.5cm; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>${name}</h1>
    ${headline ? `<p>${headline}</p>` : ''}
    ${contactLine ? `<p class="contact">${contactLine}</p>` : ''}
  </div>

  <div class="job-line">
    <strong>Applying for:</strong> ${jobTitle}
    ${department ? ` · ${department}` : ''}
    ${seniority ? ` · ${seniority}` : ''}
  </div>

  ${analysisHtml}
  ${questionsHtml}
</body>
</html>`;
}

export function CandidateExport({
  candidate,
  job,
  analysis,
  questionSets,
}: {
  candidate: CandidateRow;
  job: JobRow;
  analysis: MatchAnalysisRow | null;
  questionSets: QuestionSetRow[];
}) {
  const handleExport = () => {
    const html = buildExportHtml(candidate, job, analysis, questionSets);
    const win = window.open('', '_blank');
    if (!win) {
      alert('Please allow pop-ups to export the candidate report.');
      return;
    }
    win.document.write(html);
    win.document.close();
    // Give the browser a moment to render before triggering print
    win.setTimeout(() => {
      win.focus();
      win.print();
    }, 300);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="size-4" aria-hidden />
      Pre-Interview Export PDF
    </Button>
  );
}
