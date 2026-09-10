import { describe, expect, it } from 'vitest';
import type { RedFlagAnalysis, TranscriptEvaluation } from '@/lib/agents/schemas';
import { validateRedFlags, validateTranscriptEvaluation } from './validation';

const evaluation: TranscriptEvaluation = {
  technical_assessment: {
    score: 8,
    depth: 'strong',
    accuracy: 'accurate',
    notes: 'Clear answer.',
    evidence: ['I chose Postgres because it supports transactions.'],
  },
  communication_assessment: {
    score: 8,
    clarity: 'clear',
    structure: 'structured',
    notes: 'Concise answer.',
    evidence: ['I chose Postgres because it supports transactions.'],
  },
  overall_rating: 8,
  strengths: ['Database reasoning'],
  weaknesses: [],
  answer_breakdown: [],
  recommendation: 'hire',
  rationale: 'Strong evidence.',
};

const redFlags: RedFlagAnalysis = {
  level: 'YELLOW',
  overall_reason: 'One discrepancy needs follow-up.',
  flags: [
    {
      category: 'contradiction',
      level: 'YELLOW',
      reason: 'The dates differ.',
      evidence: [{ source: 'resume', quote: '2019 to 2021' }],
      confidence: 0.8,
    },
  ],
};

describe('orchestration validation', () => {
  it('accepts transcript evidence that appears in the source', () => {
    expect(validateTranscriptEvaluation(evaluation, 'The candidate said: I chose Postgres because it supports transactions.')).toEqual([]);
  });

  it('rejects transcript evidence that is absent from the source', () => {
    expect(validateTranscriptEvaluation(evaluation, 'No matching quote.')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported_transcript_quote', severity: 'error' }),
      ])
    );
  });

  it('accepts a red flag whose level matches its evidence', () => {
    expect(validateRedFlags(redFlags)).toEqual([]);
  });

  it('rejects an unsupported red flag', () => {
    expect(validateRedFlags({ ...redFlags, flags: [{ ...redFlags.flags[0], evidence: [] }] })).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'flag_without_evidence' })])
    );
  });
});
