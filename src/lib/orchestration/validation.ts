import type { RedFlagAnalysis, TranscriptEvaluation } from '@/lib/agents/schemas';
import type { EvidenceItem } from '@/lib/agents/evidence-agent';
import type { EvidenceClaim } from './contracts';

export interface ValidationIssue {
  code: string;
  severity: 'warning' | 'error';
  message: string;
}

/**
 * Normalize text for quote matching: lowercase, collapse all whitespace,
 * strip surrounding quote marks and trailing punctuation.
 */
function normalizeForQuoteMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'""''\s]+|["'""''\s.!?,:;]+$/g, '');
}

/**
 * Tokenize text into lowercase word tokens, stripping punctuation and
 * ellipsis markers (…, ..., . . .) that LLMs insert to abbreviate quotes.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[…]/g, ' ')
    .replace(/\.\.\./g, ' ')
    .replace(/\.\s\.\s\./g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Check whether a quote appears in a source text using token-based fuzzy
 * matching. This tolerates the surface-level alterations LLMs commonly make
 * even when asked to copy verbatim:
 *
 * - Ellipsis insertion ("..." to abbreviate mid-quote) — stripped before match
 * - Minor word substitutions ("must" vs "needs") — up to 20% token mismatch
 * - Small insertions in the source — the window is 1.5x the quote length
 *
 * The algorithm slides a window (1.5x the quote token count) across the
 * source and checks what fraction of quote tokens appear in the window using
 * multiset (frequency) intersection. If >= 80% of quote tokens are found in
 * any window, the quote is accepted. This rejects genuine paraphrases and
 * fabrications (which have low word overlap with any region) while accepting
 * quotes that are substantively verbatim with minor alterations.
 *
 * A fast path uses exact normalized substring matching before falling back to
 * the fuzzy token matcher.
 */
function quoteInSource(quote: string, source: string): boolean {
  // Fast path: exact normalized substring match.
  const nq = normalizeForQuoteMatch(quote);
  const ns = normalizeForQuoteMatch(source);
  if (nq.length >= 8 && ns.includes(nq)) return true;

  // Fallback: fuzzy token-based window matching.
  const qTokens = tokenize(quote);
  const sTokens = tokenize(source);

  if (qTokens.length < 3) return false;

  const minMatchRatio = 0.8;
  const windowSize = Math.ceil(qTokens.length * 1.5);

  // Build a frequency map for quote tokens (multiset).
  const qCounts = new Map<string, number>();
  for (const t of qTokens) qCounts.set(t, (qCounts.get(t) ?? 0) + 1);

  for (let i = 0; i <= sTokens.length - 3; i++) {
    const windowEnd = Math.min(i + windowSize, sTokens.length);
    if (windowEnd - i < 3) continue;

    // Build a frequency map for the current window.
    const wCounts = new Map<string, number>();
    for (let j = i; j < windowEnd; j++) {
      const t = sTokens[j];
      wCounts.set(t, (wCounts.get(t) ?? 0) + 1);
    }

    // Count multiset intersection: for each unique quote token, how many
    // appear in the window (capped at the quote's count).
    let matched = 0;
    for (const [token, count] of qCounts) {
      matched += Math.min(count, wCounts.get(token) ?? 0);
    }

    if (matched / qTokens.length >= minMatchRatio) return true;
  }

  return false;
}

export function validateTranscriptEvaluation(
  evaluation: TranscriptEvaluation,
  transcript: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const evidence = [
    ...evaluation.technical_assessment.evidence,
    ...evaluation.communication_assessment.evidence,
  ];

  if (evidence.length === 0) {
    issues.push({
      code: 'missing_transcript_evidence',
      severity: 'error',
      message: 'Transcript evaluation contains no supporting quotes.',
    });
  }

  for (const quote of evidence) {
    if (!quoteInSource(quote, transcript)) {
      issues.push({
        code: 'unsupported_transcript_quote',
        severity: 'error',
        message: `Quote not found in transcript (copy the exact words from the transcript, do not paraphrase or insert "..."): "${quote.slice(0, 120)}"`,
      });
    }
  }

  return issues;
}

export interface RedFlagValidationContext {
  resume: string;
  transcript: string;
  job: string;
  retrievedEvidence: EvidenceItem[];
}

export function validateRedFlags(
  redFlags: RedFlagAnalysis,
  context?: RedFlagValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const validCaseIds = new Set(context?.retrievedEvidence.map((item) => item.ownerId) ?? []);

  for (const flag of redFlags.flags) {
    if (flag.evidence.length === 0) {
      issues.push({
        code: 'flag_without_evidence',
        severity: 'error',
        message: `Red flag ${flag.category} has no supporting evidence.`,
      });
    }
    if (flag.retrieved_cases.length === 0) {
      issues.push({
        code: 'flag_without_retrieved_case',
        severity: 'error',
        message: `Red flag ${flag.category} is not grounded in a retrieved historical case.`,
      });
    }
    if (context) {
      for (const evidence of flag.evidence) {
        const source = evidence.source === 'resume'
          ? context.resume
          : evidence.source === 'transcript'
            ? context.transcript
            : context.job;
        if (!quoteInSource(evidence.quote, source)) {
          issues.push({
            code: 'unsupported_flag_quote',
            severity: 'error',
            message: `Red flag ${flag.category} cites a quote not found in ${evidence.source}.`,
          });
        }
      }
      for (const retrievedCase of flag.retrieved_cases) {
        if (!validCaseIds.has(retrievedCase.owner_id)) {
          issues.push({
            code: 'invalid_retrieved_case',
            severity: 'error',
            message: `Red flag ${flag.category} cites a case that was not retrieved: ${retrievedCase.owner_id}.`,
          });
        }
      }
    }
  }

  const highest = redFlags.flags.some((flag) => flag.level === 'RED')
    ? 'RED'
    : redFlags.flags.some((flag) => flag.level === 'YELLOW')
      ? 'YELLOW'
      : 'GREEN';

  if (highest !== redFlags.level) {
    issues.push({
      code: 'inconsistent_flag_level',
      severity: 'error',
      message: 'Top-level red flag severity does not match the highest individual flag.',
    });
  }

  return issues;
}

/**
 * Drops every red flag that fails grounding (missing/unverifiable quotes,
 * missing or invalid retrieved cases, empty reason) and recomputes the
 * top-level severity. Used as the reflexion fallback so a partially valid
 * result is returned instead of failing the whole run.
 */
export function sanitizeRedFlags(
  redFlags: RedFlagAnalysis,
  context: RedFlagValidationContext,
): RedFlagAnalysis {
  const validCaseIds = new Set(context.retrievedEvidence.map((item) => item.ownerId));

  const flags = redFlags.flags.filter((flag) => {
    if (flag.evidence.length === 0 || flag.retrieved_cases.length === 0) return false;
    if (!flag.reason.trim()) return false;
    if (!flag.retrieved_cases.every((item) => validCaseIds.has(item.owner_id))) return false;
    return flag.evidence.every((evidence) => {
      const source =
        evidence.source === 'resume'
          ? context.resume
          : evidence.source === 'transcript'
            ? context.transcript
            : context.job;
      return quoteInSource(evidence.quote, source);
    });
  });

  const level = flags.some((flag) => flag.level === 'RED')
    ? ('RED' as const)
    : flags.some((flag) => flag.level === 'YELLOW')
      ? ('YELLOW' as const)
      : ('GREEN' as const);

  return { ...redFlags, level, flags };
}

export function claimsFromTranscriptEvaluation(
  evaluation: TranscriptEvaluation,
  sourceId: string,
): EvidenceClaim[] {
  return [
    ...evaluation.technical_assessment.evidence,
    ...evaluation.communication_assessment.evidence,
  ].map((quote) => ({
    sourceType: 'transcript' as const,
    sourceId,
    quote,
    claim: 'Transcript evidence supporting an evaluation assessment.',
    confidence: 1,
  }));
}
