import type { RedFlagAnalysis, TranscriptEvaluation } from '@/lib/agents/schemas';
import type { EvidenceClaim } from './contracts';

export interface ValidationIssue {
  code: string;
  severity: 'warning' | 'error';
  message: string;
}

export function validateTranscriptEvaluation(
  evaluation: TranscriptEvaluation,
  transcript: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const source = transcript.toLowerCase();
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
    if (quote.trim().length < 8 || !source.includes(quote.toLowerCase().trim())) {
      issues.push({
        code: 'unsupported_transcript_quote',
        severity: 'error',
        message: 'Transcript evaluation contains a quote that is not present in the source transcript.',
      });
    }
  }

  return issues;
}

export function validateRedFlags(redFlags: RedFlagAnalysis): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const flag of redFlags.flags) {
    if (flag.evidence.length === 0) {
      issues.push({
        code: 'flag_without_evidence',
        severity: 'error',
        message: `Red flag ${flag.category} has no supporting evidence.`,
      });
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
