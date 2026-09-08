import { generateStructured } from '@/lib/ai/structured';
import {
  analysisAndQuestionsSchema,
  clampScore,
  type AnalysisAndQuestions,
} from '@/lib/agents/schemas';
import { formatEvidence, type EvidenceItem } from '@/lib/agents/evidence-agent';
import {
  computeCoverage,
  reconcileScore,
  type CandidateSkillRow,
  type JobSkillRow,
} from '@/lib/domain/matching';
import { displaySkill } from '@/lib/domain/skills';

const SYSTEM = `You are the Gap Analysis and Question Agent in a recruitment intelligence platform.
You perform two tasks in a single pass:

1. Compare a job's requirements against a candidate's profile and produce an
   evidence-based assessment.
2. Generate an interview question set tailored to this specific candidate and job.

=== GAP ANALYSIS RULES ===
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

=== QUESTION GENERATION RULES ===
Produce questions in four categories:
- screening: quick role-fit checks an early-stage recruiter can run.
- deep_technical: probing questions on the technologies the job actually requires
  and the candidate claims. Ask about trade-offs, failure modes and decisions,
  never trivia that can be looked up.
- gap_validation: targets the identified gaps. The goal is to find out whether the
  gap is real or simply absent from the resume. Do not phrase these as accusations.
- experience_validation: verifies claimed projects and scope are genuinely the
  candidate's own work, by asking for specifics only a real participant would know.

- Reference the candidate's actual projects, employers and claims. Generic questions
  are a failure.
- expected_signals must be concrete, checkable things a strong answer contains -
  specific concepts, tools, numbers or trade-offs. Not "good communication".
- Every question needs a rationale explaining what it establishes about this candidate.
- Generate 2 to 3 screening, 3 to 4 deep_technical, and one question per identified
  gap and per major claimed project.
- Never ask about protected characteristics, age, family, health or nationality.
- Keep the total question count under 20. Quality over quantity.`;

const USER = `Assess this candidate against the job and generate the interview question set.

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
{evidence}`;

export interface AnalysisAndQuestionsResult {
  analysis: AnalysisAndQuestions;
  coverageScore: number;
  requiredCoverage: number;
  questions: AnalysisAndQuestions['questions'];
}

/** Combined Feature 3+4: gap analysis and question generation in one LLM call. */
export async function runAnalysisAndQuestionsAgent(input: {
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
}): Promise<AnalysisAndQuestionsResult> {
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

  const result = await generateStructured({
    schema: analysisAndQuestionsSchema,
    schemaName: 'analysis_and_questions',
    runName: 'Gap Analysis + Question Agent',
    system: SYSTEM,
    user: USER,
    maxTokens: 4000,
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
    },
  });

  const analysis: AnalysisAndQuestions = {
    ...result,
    match_score: reconcileScore(coverage.score, clampScore(result.match_score ?? 0)),
    strong_skills: (result.strong_skills ?? []).map((s) => ({
      ...s,
      importance: clampScore(s.importance ?? 0),
    })),
    missing_skills: (result.missing_skills ?? []).map((s) => ({
      ...s,
      importance: clampScore(s.importance ?? 0),
    })),
  };

  const questions = (result.questions ?? [])
    .filter((q) => q.question.trim().length > 0)
    .slice(0, 20);

  return {
    analysis,
    coverageScore: coverage.score,
    requiredCoverage: coverage.requiredCoverage,
    questions,
  };
}
