import { generateStructured } from '@/lib/ai/structured';
import {
  clamp,
  resumeExtractionSchema,
  type ResumeExtraction,
} from '@/lib/agents/schemas';
import { normaliseSkill } from '@/lib/domain/skills';

const SYSTEM = `You are the Resume Agent in a recruitment intelligence platform.
You read a raw resume and extract a structured candidate profile.

Rules:
- Extract only what the resume states. Never infer skills the candidate did not claim.
- For every skill, populate evidence with the role, project or bullet that backs it.
  If a skill only appears in a skills list with no supporting context, set evidence to null.
- Only set proficiency when the resume signals it (years, seniority, "expert in").
  Otherwise use null.
- total_years_experience should be computed from the employment timeline, not copied
  from a self-description. Use null if the timeline is unclear.
- Preserve the candidate's own wording in labels; normalisation happens downstream.
- Capture projects separately from employment, including personal and open-source work.`;

const USER = `Extract the structured candidate profile from this resume.

Resume:
---
{resume}
---`;

export interface ResumeAgentResult {
  extraction: ResumeExtraction;
  /** Rows ready for insert into candidate_skills. */
  skillRows: Array<{
    skill: string;
    raw_label: string;
    category: ResumeExtraction['skills'][number]['category'];
    proficiency: ResumeExtraction['skills'][number]['proficiency'];
    years: number | null;
    evidence: string | null;
  }>;
}

/** Feature 2: parse a resume into a structured, skill-normalised profile. */
export async function runResumeAgent(input: { resume: string }): Promise<ResumeAgentResult> {
  const extraction = await generateStructured({
    schema: resumeExtractionSchema,
    schemaName: 'resume_extraction',
    runName: 'Resume Agent',
    system: SYSTEM,
    user: USER,
    tier: 'fast',
    maxTokens: 4000,
    input: { resume: input.resume.slice(0, 12000) },
  });

  // Technologies named inside experience/projects are real signal, so fold them
  // into the skill list rather than losing them.
  const implied = new Set<string>();
  for (const role of extraction.experience ?? []) {
    (role.technologies ?? []).forEach((t) => implied.add(t));
  }
  for (const project of extraction.projects ?? []) {
    (project.technologies ?? []).forEach((t) => implied.add(t));
  }

  const seen = new Set<string>();
  const skillRows: ResumeAgentResult['skillRows'] = [];

  for (const skill of extraction.skills ?? []) {
    const normalised = normaliseSkill(skill.label);
    if (!normalised) continue;

    const key = `${normalised}::${skill.category}`;
    if (seen.has(key)) continue;
    seen.add(key);

    skillRows.push({
      skill: normalised,
      raw_label: skill.label,
      category: skill.category,
      proficiency: skill.proficiency,
      years: skill.years === null ? null : clamp(skill.years, 0, 50),
      evidence: skill.evidence,
    });
  }

  for (const label of implied) {
    const normalised = normaliseSkill(label);
    if (!normalised) continue;

    const key = `${normalised}::technology`;
    if (seen.has(key)) continue;
    // Skip if the same token was already captured under another category.
    if ([...seen].some((k) => k.startsWith(`${normalised}::`))) continue;
    seen.add(key);

    skillRows.push({
      skill: normalised,
      raw_label: label,
      category: 'technology',
      proficiency: null,
      years: null,
      evidence: 'Referenced in experience or project history',
    });
  }

  return { extraction, skillRows };
}
