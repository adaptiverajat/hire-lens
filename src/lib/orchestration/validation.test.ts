import { describe, expect, it } from 'vitest';
import type { RedFlagAnalysis, TranscriptEvaluation } from '@/lib/agents/schemas';
import type { EvidenceItem } from '@/lib/agents/evidence-agent';
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
      retrieved_cases: [{ owner_id: 'case-1', title: 'Timeline discrepancy', relevance: 'A similar date mismatch required follow-up.' }],
      confidence: 0.8,
    },
  ],
};

const retrievedEvidence: EvidenceItem[] = [{
  source: 'knowledge_entry',
  ownerId: 'case-1',
  similarity: 0.82,
  content: 'A verified timeline discrepancy required a follow-up interview.',
  title: 'Timeline discrepancy',
  outcome: 'hold',
  retrievalIntent: 'red_flag_grounding',
  retrievalQuery: 'historical timeline discrepancies',
}];

describe('orchestration validation', () => {
  it('accepts transcript evidence that appears in the source', () => {
    expect(validateTranscriptEvaluation(evaluation, 'The candidate said: I chose Postgres because it supports transactions.')).toEqual([]);
  });

  it('rejects transcript evidence that is absent from the source', () => {
    const issues = validateTranscriptEvaluation(evaluation, 'No matching quote.');
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported_transcript_quote', severity: 'error' }),
      ])
    );
    // Error message should include the specific failed quote for actionable reflexion feedback
    expect(issues.every((i) => i.message.includes('I chose Postgres'))).toBe(true);
  });

  it('accepts quotes with different whitespace (newlines collapsed)', () => {
    const evalWithWhitespace: TranscriptEvaluation = {
      ...evaluation,
      technical_assessment: {
        ...evaluation.technical_assessment,
        evidence: ['I chose Postgres because it supports transactions'],
      },
      communication_assessment: {
        ...evaluation.communication_assessment,
        evidence: ['I chose Postgres because it supports transactions'],
      },
    };
    const transcript = 'The candidate said:\n\n  I chose Postgres because it supports transactions.\n';
    expect(validateTranscriptEvaluation(evalWithWhitespace, transcript)).toEqual([]);
  });

  it('accepts quotes with trailing punctuation differences', () => {
    const evalWithPunct: TranscriptEvaluation = {
      ...evaluation,
      technical_assessment: {
        ...evaluation.technical_assessment,
        evidence: ['I chose Postgres because it supports transactions.'],
      },
      communication_assessment: {
        ...evaluation.communication_assessment,
        evidence: ['I chose Postgres because it supports transactions!'],
      },
    };
    const transcript = 'I chose Postgres because it supports transactions';
    expect(validateTranscriptEvaluation(evalWithPunct, transcript)).toEqual([]);
  });

  it('accepts quotes with surrounding smart quotes', () => {
    const evalWithQuotes: TranscriptEvaluation = {
      ...evaluation,
      technical_assessment: {
        ...evaluation.technical_assessment,
        evidence: ['"I chose Postgres because it supports transactions"'],
      },
      communication_assessment: {
        ...evaluation.communication_assessment,
        evidence: ['"I chose Postgres because it supports transactions"'],
      },
    };
    const transcript = 'I chose Postgres because it supports transactions';
    expect(validateTranscriptEvaluation(evalWithQuotes, transcript)).toEqual([]);
  });

  it('rejects paraphrased quotes that are not in the transcript', () => {
    const evalParaphrased: TranscriptEvaluation = {
      ...evaluation,
      technical_assessment: {
        ...evaluation.technical_assessment,
        evidence: ['I selected PostgreSQL for its transactional support'],
      },
      communication_assessment: {
        ...evaluation.communication_assessment,
        evidence: ['I selected PostgreSQL for its transactional support'],
      },
    };
    const issues = validateTranscriptEvaluation(evalParaphrased, 'I chose Postgres because it supports transactions');
    expect(issues.length).toBe(2);
    expect(issues.every((i) => i.code === 'unsupported_transcript_quote')).toBe(true);
  });

  it('accepts quotes with ellipsis (...) inserted to abbreviate', () => {
    const evalWithEllipsis: TranscriptEvaluation = {
      ...evaluation,
      technical_assessment: {
        ...evaluation.technical_assessment,
        evidence: ['I chose Postgres... it supports transactions'],
      },
      communication_assessment: {
        ...evaluation.communication_assessment,
        evidence: ['I chose Postgres... it supports transactions'],
      },
    };
    const transcript = 'I chose Postgres because it supports transactions';
    expect(validateTranscriptEvaluation(evalWithEllipsis, transcript)).toEqual([]);
  });

  it('accepts quotes with minor word substitutions (1 word different)', () => {
    const evalWithSub: TranscriptEvaluation = {
      ...evaluation,
      technical_assessment: {
        ...evaluation.technical_assessment,
        evidence: ['I chose Postgres since it supports transactions'],
      },
      communication_assessment: {
        ...evaluation.communication_assessment,
        evidence: ['I chose Postgres since it supports transactions'],
      },
    };
    const transcript = 'I chose Postgres because it supports transactions';
    expect(validateTranscriptEvaluation(evalWithSub, transcript)).toEqual([]);
  });

  it('rejects heavily altered quotes (more than 20% words different)', () => {
    const evalAltered: TranscriptEvaluation = {
      ...evaluation,
      technical_assessment: {
        ...evaluation.technical_assessment,
        evidence: ['We picked MySQL for reliable data storage and performance'],
      },
      communication_assessment: {
        ...evaluation.communication_assessment,
        evidence: ['We picked MySQL for reliable data storage and performance'],
      },
    };
    const transcript = 'I chose Postgres because it supports transactions';
    const issues = validateTranscriptEvaluation(evalAltered, transcript);
    expect(issues.length).toBe(2);
    expect(issues.every((i) => i.code === 'unsupported_transcript_quote')).toBe(true);
  });

  it('accepts a red flag whose level matches its evidence', () => {
    expect(validateRedFlags(redFlags)).toEqual([]);
  });

  it('rejects an unsupported red flag', () => {
    expect(validateRedFlags({ ...redFlags, flags: [{ ...redFlags.flags[0], evidence: [] }] })).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'flag_without_evidence' })])
    );
  });

  it('accepts a red flag grounded in source text and a retrieved case', () => {
    expect(validateRedFlags(redFlags, {
      resume: 'Employment ran from 2019 to 2021.',
      transcript: '',
      job: '',
      retrievedEvidence,
    })).toEqual([]);
  });

  it('rejects a red flag that cites a case the retrieval agent did not return', () => {
    const unsupported = {
      ...redFlags,
      flags: [{
        ...redFlags.flags[0],
        retrieved_cases: [{ owner_id: 'invented-case', title: 'Unknown', relevance: 'Not retrieved.' }],
      }],
    };
    expect(validateRedFlags(unsupported, {
      resume: 'Employment ran from 2019 to 2021.',
      transcript: '',
      job: '',
      retrievedEvidence,
    })).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'invalid_retrieved_case' })]));
  });
});
