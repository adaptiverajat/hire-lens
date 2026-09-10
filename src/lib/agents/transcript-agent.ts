import { generateStructured } from '@/lib/ai/structured';
import {
  clampRating,
  transcriptEvaluationSchema,
  type TranscriptEvaluation,
} from '@/lib/agents/schemas';
import { formatEvidence, type EvidenceItem } from '@/lib/agents/evidence-agent';
import type { AgentMemoryNote } from '@/lib/orchestration/memory';

const SYSTEM = `You are the Transcript Evaluation Agent in a recruitment intelligence platform.
You read an interview transcript and assess how well the candidate actually performed.

Rules:
- Ground every judgement in the transcript. Each assessment must cite direct quotes
  in its evidence array. An assertion without a quote is not acceptable.
- Score technical and communication separately on 0-10. They are independent:
  a candidate can be technically strong and a poor communicator.
- For answer_breakdown, work through the planned questions. Set was_asked to false
  when a question does not appear in the transcript, give it a score of 0 and say so
  in feedback. Do not penalise the candidate for questions nobody asked - reflect
  that in the notes rather than the overall rating.
- signals_hit and signals_missed must be drawn from the expected signals supplied
  for each question.
- Judge the answer the candidate gave, not the answer you would have given.
- Transcripts are machine-generated and contain mis-transcriptions. Do not treat a
  garbled word as a factual error if the intent is clear.
- overall_rating should reflect the whole interview weighted toward the technical
  depth required by the job, and must be consistent with the two sub-scores.
- Historical cases are for calibration of your standards only.`;

const USER = `Evaluate this interview.

JOB
Title: {jobTitle}
Summary: {jobSummary}
Key requirements: {requirements}

CANDIDATE
Name: {candidateName}
Resume summary: {candidateSummary}

PLANNED QUESTIONS AND EXPECTED SIGNALS
{questions}

TRANSCRIPT
Participants: {participants}
---
{transcript}
---

CALIBRATION - COMPARABLE PAST EVALUATIONS
{evidence}
{feedback}
{calibrationNotes}`;

export interface PlannedQuestion {
  question: string;
  category: string;
  expected_signals: string[];
}

/** Feature 5: evaluate an interview transcript. */
export async function runTranscriptAgent(input: {
  jobTitle: string;
  jobSummary: string;
  requirements: string[];
  candidateName: string;
  candidateSummary: string;
  questions: PlannedQuestion[];
  transcript: string;
  participants: string[];
  evidence: EvidenceItem[];
  /** Reflexion feedback from a previous failed validation attempt. */
  feedback?: string;
  /** Calibration notes from shared agent memory. */
  calibrationNotes?: AgentMemoryNote[];
}): Promise<TranscriptEvaluation> {
  const questions = input.questions.length
    ? input.questions
        .map(
          (q, i) =>
            `${i + 1}. [${q.category}] ${q.question}\n   Expected signals: ${
              q.expected_signals.join(', ') || 'not specified'
            }`
        )
        .join('\n')
    : 'No question set was generated in advance. Assess the interview on its own terms and leave answer_breakdown empty.';

  const result = await generateStructured({
    schema: transcriptEvaluationSchema,
    schemaName: 'transcript_evaluation',
    runName: 'Transcript Evaluation Agent',
    system: SYSTEM,
    user: USER,
    maxTokens: 6000,
    input: {
      jobTitle: input.jobTitle,
      jobSummary: input.jobSummary,
      requirements: input.requirements.join(', ') || 'none extracted',
      candidateName: input.candidateName,
      candidateSummary: input.candidateSummary,
      questions,
      participants: input.participants.join(', ') || 'not identified',
      transcript: input.transcript.slice(0, 24000),
      evidence: formatEvidence(input.evidence),
      feedback: input.feedback
        ? `\n\nVALIDATION FEEDBACK (previous attempt failed):\n${input.feedback}\nPlease correct these issues.`
        : '',
      calibrationNotes: input.calibrationNotes && input.calibrationNotes.length > 0
        ? `\n\nCALIBRATION NOTES (from past runs — adjust your behavior accordingly)\n${input.calibrationNotes.map((n, i) => `Note ${i + 1} (${n.note_type}, ${Math.round(n.confidence * 100)}%): ${n.content}`).join('\n')}`
        : '',
    },
  });

  return {
    ...result,
    overall_rating: clampRating(result.overall_rating ?? 0),
    technical_assessment: {
      ...result.technical_assessment,
      score: clampRating(result.technical_assessment?.score ?? 0),
    },
    communication_assessment: {
      ...result.communication_assessment,
      score: clampRating(result.communication_assessment?.score ?? 0),
    },
    answer_breakdown: (result.answer_breakdown ?? []).map((a) => ({
      ...a,
      score: clampRating(a.score ?? 0),
    })),
  };
}
