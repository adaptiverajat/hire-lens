import { generateStructured } from '@/lib/ai/structured';
import { questionGenerationSchema, type QuestionGeneration } from '@/lib/agents/schemas';
import { formatEvidence, type EvidenceItem } from '@/lib/agents/evidence-agent';
import type { GapAnalysis } from '@/lib/agents/schemas';
import { displaySkill } from '@/lib/domain/skills';

const SYSTEM = `You are the Question Agent in a recruitment intelligence platform.
You generate an interview question set tailored to one specific candidate applying
for one specific job.

Produce questions in four categories:
- screening: quick role-fit check an early-stage recruiter can run.
- deep_technical: probing questions on the technologies the job actually requires
  and the candidate claims. Ask about trade-offs, failure modes and decisions,
  never trivia that can be looked up.
- gap_validation: targets the identified gaps. The goal is to find out whether the
  gap is real or simply absent from the resume. Do not phrase these as accusations.
- experience_validation: verifies claimed projects and scope are genuinely the
  candidate's own work, by asking for specifics only a real participant would know.

Rules:
- Reference the candidate's actual projects, employers and claims. Generic questions
  are a failure.
- expected_signals must be concrete, checkable things a strong answer contains -
  specific concepts, tools, numbers or trade-offs. Not "good communication".
- Every question needs a rationale explaining what it establishes about this candidate.
- Generate 2 to 3 screening, 3 to 4 deep_technical, and one question per identified
  gap and per major claimed project.
- Never ask about protected characteristics, age, family, health or nationality.
- Keep the total question count under 20. Quality over quantity.`;

const USER = `Generate the interview question set.

JOB
Title: {jobTitle}
Summary: {jobSummary}
Key requirements: {requirements}

CANDIDATE
Name: {candidateName}
Headline: {candidateHeadline}
Claimed skills: {candidateSkills}
Experience and projects:
{candidateHistory}

MATCH ANALYSIS
Score: {matchScore} out of 100 ({verdict})
Strong areas: {strongSkills}
Gaps to probe: {missingSkills}
Partial matches: {partialSkills}
Areas the analysis flagged for validation:
{areasToValidate}

WHAT WORKED IN COMPARABLE PAST INTERVIEWS
{evidence}`;

/** Feature 4: generate a reusable, candidate-specific question set. */
export async function runQuestionAgent(input: {
  jobTitle: string;
  jobSummary: string;
  requirements: string[];
  candidateName: string;
  candidateHeadline: string | null;
  candidateSkills: string[];
  candidateHistory: string;
  gap: GapAnalysis;
  evidence: EvidenceItem[];
}): Promise<QuestionGeneration> {
  const result = await generateStructured({
    schema: questionGenerationSchema,
    schemaName: 'question_generation',
    runName: 'Question Agent',
    system: SYSTEM,
    user: USER,
    temperature: 0.4,
    input: {
      jobTitle: input.jobTitle,
      jobSummary: input.jobSummary,
      requirements: input.requirements.map(displaySkill).join(', ') || 'none extracted',
      candidateName: input.candidateName,
      candidateHeadline: input.candidateHeadline ?? 'not stated',
      candidateSkills: input.candidateSkills.map(displaySkill).join(', ') || 'none extracted',
      candidateHistory: input.candidateHistory.slice(0, 6000),
      matchScore: input.gap.match_score,
      verdict: input.gap.verdict,
      strongSkills: input.gap.strong_skills.map((s) => s.skill).join(', ') || 'none identified',
      missingSkills:
        input.gap.missing_skills
          .map((s) => `${s.skill} (${s.severity} severity)`)
          .join(', ') || 'none identified',
      partialSkills: input.gap.partial_skills.map((s) => s.skill).join(', ') || 'none identified',
      areasToValidate:
        input.gap.areas_to_validate
          .map((a) => `- ${a.area}: ${a.why} (focus: ${a.suggested_focus})`)
          .join('\n') || '- none identified',
      evidence: formatEvidence(input.evidence),
    },
    pii: { names: [input.candidateName] },
  });

    return {
    questions: result.questions
      .filter((q) => q.question.trim().length > 0)
      .slice(0, 20),
  };
}
