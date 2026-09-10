import { runCandidateAnalysis, type CandidateAnalysisResult } from '@/lib/graphs/candidate-analysis';
import { runJdIntake, runResumeIntake } from '@/lib/graphs/intake';
import type { JdIntakeResult, ResumeIntakeResult } from '@/lib/graphs/intake';
import { runTranscriptReview, type TranscriptReviewResult } from '@/lib/graphs/transcript-review';

export const WORKFLOW_PLAN = {
  jd_intake: ['JD Agent'],
  resume_intake: ['Resume Agent'],
  candidate_analysis: [
    'Supervisor (route_analysis)',
    'Evidence Retrieval Agent',
    'Gap Analysis Agent',
    'Gap Evidence Retrieval (agentic RAG)',
    'Question Agent',
  ],
  transcript_review: [
    'Evidence Retrieval Agent',
    'Transcript Evaluation Agent (reflexion)',
    'Red Flag Agent (reflexion)',
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
 *
 * Overloads preserve the specific return type for each workflow so callers
 * can access workflow-specific fields without narrowing a union.
 */
export async function runOrchestratedWorkflow(
  input: { workflow: 'jd_intake'; userId: string; jobId: string },
): Promise<JdIntakeResult>;
export async function runOrchestratedWorkflow(
  input: { workflow: 'resume_intake'; userId: string; candidateId: string },
): Promise<ResumeIntakeResult>;
export async function runOrchestratedWorkflow(
  input: { workflow: 'candidate_analysis'; userId: string; jobId: string; candidateId: string },
): Promise<CandidateAnalysisResult>;
export async function runOrchestratedWorkflow(
  input: { workflow: 'transcript_review'; userId: string; transcriptId: string; candidateId?: string },
): Promise<TranscriptReviewResult>;
export async function runOrchestratedWorkflow(input: OrchestratorInput): Promise<unknown> {
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
