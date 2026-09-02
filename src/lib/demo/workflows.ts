/**
 * Maps each App Router pathname to the agent lifecycle that is relevant on that page.
 *
 * When demo mode is enabled, the full lifecycle is shown on every page so the
 * recruiter can see the complete pipeline and which agents have already run.
 */

export const FULL_LIFECYCLE = [
  'JD Agent',
  'Resume Agent',
  'Evidence Retrieval Agent',
  'Gap Analysis Agent',
  'Question Agent',
  'Transcript Evaluation Agent',
  'Red Flag Agent',
  'Human Review Agent',
];

export function getWorkflowStages(_pathname: string): string[] {
  return FULL_LIFECYCLE;
}
