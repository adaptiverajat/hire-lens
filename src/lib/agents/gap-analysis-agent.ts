import { generateStructured } from '@/lib/ai/structured';
import { clampScore, gapAnalysisSchema, type GapAnalysis } from '@/lib/agents/schemas';
import { formatEvidence, type EvidenceItem } from '@/lib/agents/evidence-agent';
import {
  computeCoverage,
  reconcileScore,
  type CandidateSkillRow,
  type JobSkillRow,
} from '@/lib/domain/matching';
import { displaySkill } from '@/lib/domain/skills';
import type { AgentMemoryNote } from '@/lib/orchestration/memory';

const SYSTEM = `You are the Gap Analysis Agent in a recruitment intelligence platform.
You compare a job's requirements against a candidate's profile and produce an
evidence-based assessment.

Rules:
- Every entry in strong_skills must cite concrete evidence from the resume.
  If you cannot point to evidence, it is not a strong skill.
- A deterministic weighted-coverage score is supplied to you. Treat it as the anchor.
  Stay within 35 points of it unless the resume contains a decisive factor the
  keyword overlap cannot see, and say so explicitly in the summary if you deviate.
- The coverage score uses keyword matching and may undercount transferable skills.
  If a candidate has a closely related skill (e.g. "Vue" for a "React" requirement,
  or "PostgreSQL" for a "database" requirement), credit it in your assessment and
  you may score above the anchor.
- severity for missing skills: high when the requirement is mandatory and central,
  medium when mandatory but learnable, low when it is a nice-to-have.
- partial_skills is for capabilities the candidate has but at insufficient depth,
  scale or recency.
- areas_to_validate must be things an interview can actually resolve. Do not list
  a missing skill as an area to validate unless the resume is ambiguous about it.
- Historical cases are provided for calibration only. Never treat a past outcome as
  a rule, and never mention a candidate from a past case by name.
- When pipeline context about other candidates is provided, use it to differentiate
  this candidate. If another candidate is strong where this one is weak, prioritise
  that gap in areas_to_validate. Do not rank candidates against each other — focus
  on what makes this candidate's interview worth conducting.`;

const USER = `Assess this candidate against the job.

JOB
Title: {jobTitle}
Summary: {jobSummary}
Requirements (importance, mandatory flag):
{requirements}

CANDIDATE
Name: {candidateName}
Headline: {candidateHeadline}
Total years of experience: {candidateYears}
Profile summary: {candidateSummary}
Skills claimed:
{candidateSkills}
Experience and projects:
{candidateHistory}

DETERMINISTIC SIGNALS
Weighted coverage score: {coverageScore} out of 100
Mandatory-requirement coverage: {requiredCoverage} out of 100
Requirements matched: {matchedList}
Requirements with no match: {missingList}

COMPARABLE HISTORICAL CASES
{evidence}
{peerContext}
{calibrationNotes}`;

export interface GapAnalysisAgentResult {
  analysis: GapAnalysis;
  coverageScore: number;
  requiredCoverage: number;
}

/** Feature 3: JD vs resume match analysis. */
export async function runGapAnalysisAgent(input: {
  jobTitle: string;
  jobSummary: string;
  jobSkills: JobSkillRow[];
  candidateName: string;
  candidateHeadline: string | null;
  candidateSummary: string;
  candidateYears: number | null;
  candidateSkills: CandidateSkillRow[];
  candidateHistory: string;
  evidence: EvidenceItem[];
  /** Summary of other candidates in the same pipeline for differentiation. */
  peerContext?: string;
  /** Calibration notes from shared agent memory. */
  calibrationNotes?: AgentMemoryNote[];
}): Promise<GapAnalysisAgentResult> {
  const coverage = computeCoverage(input.jobSkills, input.candidateSkills);

  const requirements = input.jobSkills.length
    ? input.jobSkills
        .map(
          (s) =>
            `- ${displaySkill(s.skill)} [${s.category}] importance ${s.importance}, ${
              s.is_required ? 'mandatory' : 'preferred'
            }${s.min_years ? `, ${s.min_years}+ years` : ''}`
        )
        .join('\n')
    : '- none extracted';

  const candidateSkills = input.candidateSkills.length
    ? input.candidateSkills
        .map(
          (s) =>
            `- ${displaySkill(s.skill)} [${s.category}]${s.years ? `, ${s.years} years` : ''}${
              s.proficiency ? `, ${s.proficiency}` : ''
            }${s.evidence ? ` - ${s.evidence}` : ''}`
        )
        .join('\n')
    : '- none extracted';

  const analysis = await generateStructured({
    schema: gapAnalysisSchema,
    schemaName: 'gap_analysis',
    runName: 'Gap Analysis Agent',
    system: SYSTEM,
    user: USER,
    input: {
      jobTitle: input.jobTitle,
      jobSummary: input.jobSummary,
      requirements,
      candidateName: input.candidateName,
      candidateHeadline: input.candidateHeadline ?? 'not stated',
      candidateYears: input.candidateYears ?? 'not stated',
      candidateSummary: input.candidateSummary,
      candidateSkills,
      candidateHistory: input.candidateHistory.slice(0, 6000),
      coverageScore: coverage.score,
      requiredCoverage: coverage.requiredCoverage,
      matchedList:
        coverage.matched.map((m) => displaySkill(m.skill)).join(', ') || 'none',
      missingList:
        coverage.missing.map((m) => displaySkill(m.skill)).join(', ') || 'none',
      evidence: formatEvidence(input.evidence),
      peerContext: input.peerContext
        ? `\n\nPIPELINE CONTEXT\n${input.peerContext}\nUse this to differentiate this candidate from others in the pipeline. Prioritise questions that reveal whether this candidate stands out in areas where others are weak.`
        : '',
      calibrationNotes: input.calibrationNotes && input.calibrationNotes.length > 0
        ? `\n\nCALIBRATION NOTES (from past runs — adjust your behavior accordingly)\n${input.calibrationNotes.map((n, i) => `Note ${i + 1} (${n.note_type}, ${Math.round(n.confidence * 100)}%): ${n.content}`).join('\n')}`
        : '',
    },
  });

  return {
    analysis: {
      ...analysis,
      match_score: reconcileScore(coverage.score, clampScore(analysis.match_score)),
      strong_skills: analysis.strong_skills.map((s) => ({
        ...s,
        importance: clampScore(s.importance),
      })),
      missing_skills: analysis.missing_skills.map((s) => ({
        ...s,
        importance: clampScore(s.importance),
      })),
    },
    coverageScore: coverage.score,
    requiredCoverage: coverage.requiredCoverage,
  };
}
