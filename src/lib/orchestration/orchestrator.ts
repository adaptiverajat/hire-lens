import { runCandidateAnalysis } from '@/lib/graphs/candidate-analysis';
import { runJdIntake, runResumeIntake } from '@/lib/graphs/intake';
import { runTranscriptReview } from '@/lib/graphs/transcript-review';

export const WORKFLOW_PLAN = {
  jd_intake: ['JD Agent'],
  resume_intake: ['Resume Agent'],
  candidate_analysis: ['Evidence Retrieval Agent', 'Gap Analysis Agent', 'Question Agent'],
  transcript_review: [
    'Evidence Retrieval Agent',
    'Transcript Evaluation Agent',
    'Red Flag Agent',
    'Human Review Agent',
  ],
} as const;

export type OrchestratedWorkflow = keyof typeof WORKFLOW_PLAN;

export type OrchestratorInput =
  | { workflow: 'jd_intake'; userId: string; jobId: string }
  | { workflow: 'resume_intake'; userId: string; candidateId: string }
  | { workflow: 'candidate_analysis'; userId: string; jobId: string; candidateId: string }
  | { workflow: 'transcript_review'; userId: string; transcriptId: string; candidateId?: string };

/**
 * Deterministic control-plane entry point for all agent workflows.
 * Agent reasoning stays inside the specialized agents; this layer selects the
 * workflow, preserves typed inputs, and gives callers one orchestration API.
 */
export async function runOrchestratedWorkflow(input: OrchestratorInput) {
  switch (input.workflow) {
    case 'jd_intake':
      return runJdIntake({ userId: input.userId, jobId: input.jobId });
    case 'resume_intake':
      return runResumeIntake({ userId: input.userId, candidateId: input.candidateId });
    case 'candidate_analysis':
      return runCandidateAnalysis({
        userId: input.userId,
        jobId: input.jobId,
        candidateId: input.candidateId,
      });
    case 'transcript_review':
      return runTranscriptReview({
        userId: input.userId,
        transcriptId: input.transcriptId,
        candidateId: input.candidateId,
      });
  }
}
