import { generateStructured } from '@/lib/ai/structured';
import { formatEvidence, type EvidenceItem } from '@/lib/agents/evidence-agent';
import { clampConfidence, redFlagSchema, type RedFlagAnalysis } from '@/lib/agents/schemas';
import type { AgentMemoryNote } from '@/lib/orchestration/memory';

const SYSTEM = `You are the Red Flag Agent in a recruitment intelligence platform.
You look for inconsistencies between what a candidate claimed and what they
demonstrated. Your output is advisory only.

CRITICAL POLICY: you never reject anyone. You surface concerns with evidence so a
human can decide. Frame every finding as something to verify, not a conclusion.

Today's date is {currentDate}. Use this as the reference for any timeline
or date-based analysis. Do not assume any other date.

Detect specifically:
- seniority_mismatch: the resume presents one level but the interview demonstrates a
  materially different one. This works in BOTH directions. A candidate who presents
  as junior but answers like an expert is just as noteworthy as the reverse, and is
  often a sign of undersold experience rather than anything negative.
- project_depth_mismatch: a project is described as substantial on the resume but the
  candidate cannot discuss its design, trade-offs or their own contribution.
- contradiction: the transcript directly conflicts with the resume on a checkable
  fact such as tenure, role, team size, ownership or technology used.
- unrealistic_claim: scope, impact or timeline that is not plausible, for example
  leading a large team while listed as an individual contributor, or an implausible
  number of concurrent senior roles.
- timeline_inconsistency: overlapping roles, unexplained gaps presented as continuous
  employment, or dates that do not reconcile. When checking dates, compare against
  today's date ({currentDate}) — employment end dates in the future are only a
  concern if they extend well beyond a normal notice period.

Levels:
- GREEN: nothing material. Use this freely. Most candidates are GREEN.
- YELLOW: a genuine discrepancy worth a follow-up question.
- RED: a severe, well-evidenced contradiction that a human must resolve before
  proceeding.

Rules:
- Every flag requires at least one direct quote in evidence, attributed to its source.
- Quotes must be copied verbatim from the supplied resume or transcript. Do not paraphrase, translate, correct grammar, or abbreviate with ellipses.
- Every flag also requires at least one retrieved historical case whose exact ID appears in the supplied cases.
- Retrieved cases are precedent for why a discrepancy matters; they never replace direct candidate evidence.
- If you cannot quote the candidate evidence and cite a retrieved case, do not flag it.
- Do not flag a candidate for being nervous, terse, or for a mis-transcription.
- Do not flag absence of a skill - that is the gap analysis agent's job, not a red flag.
- Set the top-level level to the highest severity among your flags, or GREEN if none.
- confidence reflects how firmly the evidence supports the flag, from 0 to 1.
- Return an empty flags array when nothing is found. That is a valid and common result.`;

const USER = `Review this candidate for inconsistencies.

JOB
Title: {jobTitle}
Seniority expected: {seniority}
Key requirements: {requirements}

RESUME CLAIMS
Name: {candidateName}
Stated total experience: {candidateYears} years
Headline: {candidateHeadline}
Profile:
{resumeProfile}

INTERVIEW TRANSCRIPT
{transcript}

RETRIEVED, EXPERT-VERIFIED HISTORICAL CASES
{evidence}

Assess only checkable inconsistencies between the resume claims and the transcript.
For every flag, cite one or more supplied case IDs in retrieved_cases and explain relevance.
Do not infer a red flag from another agent's scores or recommendation.{feedback}
{calibrationNotes}`;

/** Feature 6: red flag detection. Advisory only - never auto-rejects. */
export async function runRedFlagAgent(input: {
  jobTitle: string;
  seniority: string | null;
  requirements: string[];
  candidateName: string;
  candidateYears: number | null;
  candidateHeadline: string | null;
  resumeProfile: string;
  transcript: string;
  evidence: EvidenceItem[];
  candidateInstitutions?: string[];
  /** Reflexion feedback from a previous failed validation attempt. */
  feedback?: string;
  /** Calibration notes from shared agent memory. */
  calibrationNotes?: AgentMemoryNote[];
}): Promise<RedFlagAnalysis> {
  const result = await generateStructured({
    schema: redFlagSchema,
    schemaName: 'red_flag_analysis',
    runName: 'Red Flag Agent',
    system: SYSTEM,
    user: USER,
    tier: 'fast',
    maxTokens: 2000,
    temperature: 0.1,
    input: {
      currentDate: new Date().toISOString().split('T')[0],
      jobTitle: input.jobTitle,
      seniority: input.seniority ?? 'not specified',
      requirements: input.requirements.join(', ') || 'none extracted',
      candidateName: input.candidateName,
      candidateYears: input.candidateYears ?? 'not stated',
      candidateHeadline: input.candidateHeadline ?? 'not stated',
      resumeProfile: input.resumeProfile.slice(0, 6000),
      transcript: input.transcript.slice(0, 18000),
      evidence: formatEvidence(input.evidence),
      feedback: input.feedback
        ? `\n\nVALIDATION FEEDBACK (previous attempt failed):\n${input.feedback}\nPlease correct these issues.`
        : '',
      calibrationNotes: input.calibrationNotes && input.calibrationNotes.length > 0
        ? `\n\nCALIBRATION NOTES (from past runs — adjust your behavior accordingly)\n${input.calibrationNotes.map((n, i) => `Note ${i + 1} (${n.note_type}, ${Math.round(n.confidence * 100)}%): ${n.content}`).join('\n')}`
        : '',
    },
    pii: {
      names: [input.candidateName],
      institutions: input.candidateInstitutions,
    },
  });

  // Enforce candidate evidence and retrieved-case grounding mechanically.
  const validCaseIds = new Set(input.evidence.map((item) => item.ownerId));
  const flags = (result.flags ?? [])
    .filter((flag) =>
      (flag.evidence ?? []).length > 0 &&
      flag.reason.trim().length > 0 &&
      flag.retrieved_cases.length > 0 &&
      flag.retrieved_cases.every((item) => validCaseIds.has(item.owner_id))
    )
    .map((flag) => ({ ...flag, confidence: clampConfidence(flag.confidence) }));

  const level = highestLevel(flags.map((f) => f.level));

  return {
    level,
    overall_reason: result.overall_reason,
    flags,
  };
}

function highestLevel(levels: Array<'GREEN' | 'YELLOW' | 'RED'>): 'GREEN' | 'YELLOW' | 'RED' {
  if (levels.includes('RED')) return 'RED';
  if (levels.includes('YELLOW')) return 'YELLOW';
  return 'GREEN';
}
