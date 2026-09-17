import { generateStructured } from '@/lib/ai/structured';
import {
  clampConfidence,
  reviewSynthesisSchema,
  type RedFlagAnalysis,
  type ReviewSynthesis,
  type TranscriptEvaluation,
} from '@/lib/agents/schemas';
import { formatEvidence, type EvidenceItem } from '@/lib/agents/evidence-agent';
import type { AgentMemoryNote } from '@/lib/orchestration/memory';

const SYSTEM = `You are the Human Review Agent in a recruitment intelligence platform.
You assemble everything the other agents produced into a decision packet for a human
reviewer.

CRITICAL POLICY: you recommend, you never decide. A human accepts or overrides your
recommendation. Your job is to make their decision fast and well-informed, and to be
explicit about what you are uncertain about.

Rules:
- recommendation is one of advance, hold, reject, hire. Choose reject only when the
  evidence is strong and unambiguous, and even then state plainly that a human must
  confirm it.
- Any RED flag forces recommendation to hold at most. Never recommend advance or hire
  while an unresolved RED flag exists.
- headline is a single line a recruiter can scan in a queue.
- key_evidence must be concrete, quotable facts, not restatements of the scores.
- open_questions is what a human should verify before committing. If a RED or YELLOW
  flag exists, the corresponding verification belongs here.
- confidence is your confidence in the recommendation, 0 to 1. Be honest: sparse
  inputs mean low confidence.
- comparable_cases should draw on the retrieved historical cases. Never name a past
  candidate; describe the situation and its outcome.`;

const USER = `Assemble the review packet.

JOB
Title: {jobTitle}
Summary: {jobSummary}

CANDIDATE
Name: {candidateName}
Current pipeline status: {candidateStatus}

MATCH ANALYSIS
Score: {matchScore} out of 100 ({verdict})
Summary: {matchSummary}
Strong areas: {strongSkills}
Gaps: {missingSkills}

INTERVIEW EVALUATION
{evaluationBlock}

RED FLAG REVIEW
Overall level: {flagLevel}
Reason: {flagReason}
Individual flags:
{flagList}

COMPARABLE HISTORICAL CASES AND THEIR OUTCOMES
{evidence}
{calibrationNotes}`;

/** Feature 7: synthesise an evidence-based recommendation for a human reviewer. */
export async function runReviewAgent(input: {
  jobTitle: string;
  jobSummary: string;
  candidateName: string;
  candidateStatus: string;
  matchScore: number | null;
  verdict: string | null;
  matchSummary: string | null;
  strongSkills: string[];
  missingSkills: string[];
  evaluation: TranscriptEvaluation | null;
  redFlags: RedFlagAnalysis | null;
  evidence: EvidenceItem[];
  /** Calibration notes from shared agent memory. */
  calibrationNotes?: AgentMemoryNote[];
}): Promise<ReviewSynthesis> {
  const evaluationBlock = input.evaluation
    ? [
        `Overall rating: ${input.evaluation.overall_rating} out of 10`,
        `Technical: ${input.evaluation.technical_assessment.score} out of 10 - ${input.evaluation.technical_assessment.notes}`,
        `Communication: ${input.evaluation.communication_assessment.score} out of 10 - ${input.evaluation.communication_assessment.notes}`,
        `Recommendation from evaluation: ${input.evaluation.recommendation}`,
        `Strengths: ${input.evaluation.strengths.join('; ') || 'none recorded'}`,
        `Weaknesses: ${input.evaluation.weaknesses.join('; ') || 'none recorded'}`,
      ].join('\n')
    : 'No interview has been evaluated yet. Base your recommendation on the match analysis alone and reflect that in your confidence.';

  const flagList = input.redFlags?.flags.length
    ? input.redFlags.flags
        .map(
          (f) =>
            `- [${f.level}] ${f.category} (confidence ${f.confidence}): ${f.reason}\n  Evidence: ${f.evidence
              .map((e) => `${e.source}: "${e.quote}"`)
              .join(' | ')}`
        )
        .join('\n')
    : '- none raised';

  const result = await generateStructured({
    schema: reviewSynthesisSchema,
    schemaName: 'review_synthesis',
    runName: 'Human Review Agent',
    system: SYSTEM,
    user: USER,
    maxTokens: 1500,
    input: {
      jobTitle: input.jobTitle,
      jobSummary: input.jobSummary,
      candidateName: input.candidateName,
      candidateStatus: input.candidateStatus,
      matchScore: input.matchScore ?? 'not analysed',
      verdict: input.verdict ?? 'not analysed',
      matchSummary: input.matchSummary ?? 'not available',
      strongSkills: input.strongSkills.join(', ') || 'none identified',
      missingSkills: input.missingSkills.join(', ') || 'none identified',
      evaluationBlock,
      flagLevel: input.redFlags?.level ?? 'not assessed',
      flagReason: input.redFlags?.overall_reason ?? 'not assessed',
      flagList,
      evidence: formatEvidence(input.evidence),
      calibrationNotes: input.calibrationNotes && input.calibrationNotes.length > 0
        ? `\n\nCALIBRATION NOTES (from past runs — adjust your behavior accordingly)\n${input.calibrationNotes.map((n, i) => `Note ${i + 1} (${n.note_type}, ${Math.round(n.confidence * 100)}%): ${n.content}`).join('\n')}`
        : '',
    },
    pii: { names: [input.candidateName] },
  });

  // Hard guardrail: an unresolved RED flag can never yield advance/hire, no
  // matter what the model returned.
  let recommendation = result.recommendation ?? 'hold';
  if (input.redFlags?.level === 'RED' && (recommendation === 'advance' || recommendation === 'hire')) {
    recommendation = 'hold';
  }

  return {
    ...result,
    recommendation,
    confidence: clampConfidence(result.confidence ?? 0.5),
  };
}
