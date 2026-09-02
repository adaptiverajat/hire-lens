import { generateStructured } from '@/lib/ai/structured';
import { clamp, clampScore, jdExtractionSchema, type JdExtraction } from '@/lib/agents/schemas';
import { normaliseSkill } from '@/lib/domain/skills';

const SYSTEM = `You are the JD Agent in a recruitment intelligence platform.
You read a raw job description and extract a precise, structured requirement profile.

Rules:
- The title field must be the actual job title from the description, e.g. "Senior Backend Engineer",
  "Product Manager", "Data Scientist". Never use generic text like "Job description", "About the role",
  "We are hiring" or the company name as the title. If no clear title is stated, infer the best
  title from the responsibilities and seniority.
- Extract only what the job description actually states. Never invent requirements.
- Consolidate closely related items into a single broader requirement. For example,
  "React, Redux, React Router, Redux Toolkit" should become a single "React ecosystem"
  requirement rather than four separate entries. "AWS EC2, S3, Lambda, RDS" should
  become a single "AWS" requirement. This keeps the match score meaningful.
- Aim for 5-12 requirements total, not 20+. Fewer, broader requirements produce
  better match scores than many granular ones.
- Split only genuinely distinct requirements. "Python and Go" becomes two requirements.
- Assign importance from 0-100 based on emphasis: explicit must-haves and repeated
  themes score high; a single mention in a "nice to have" list scores low.
- Categorise each requirement:
  skill (general capability), technology (named tool/language/framework),
  experience (years or domain exposure), certification (formal credential),
  domain (industry knowledge).
- Set is_required to false for anything under "preferred", "nice to have", "bonus".
- If years of experience are not stated for a requirement, use null. Do not guess.`;

const USER = `Extract the structured requirement profile from this job description.

Job title supplied by the recruiter: {title}

Job description:
---
{description}
---`;

export interface JdAgentResult {
  extraction: JdExtraction;
  /** Rows ready for insert into job_skills. */
  skillRows: Array<{
    skill: string;
    raw_label: string;
    category: JdExtraction['requirements'][number]['category'];
    importance: number;
    is_required: boolean;
    min_years: number | null;
  }>;
}

/** Feature 1: parse a JD into structured requirements. */
export async function runJdAgent(input: {
  title: string;
  description: string;
}): Promise<JdAgentResult> {
  const extraction = await generateStructured({
    schema: jdExtractionSchema,
    schemaName: 'jd_extraction',
    runName: 'JD Agent',
    system: SYSTEM,
    user: USER,
    input: {
      title: input.title || 'not supplied',
      description: input.description.slice(0, 24000),
    },
  });

  // Normalise, clamp and dedupe before it reaches the database.
  const seen = new Set<string>();
  const skillRows: JdAgentResult['skillRows'] = [];

  for (const requirement of extraction.requirements) {
    const skill = normaliseSkill(requirement.label);
    if (!skill) continue;

    const key = `${skill}::${requirement.category}`;
    if (seen.has(key)) continue;
    seen.add(key);

    skillRows.push({
      skill,
      raw_label: requirement.label,
      category: requirement.category,
      importance: clampScore(requirement.importance),
      is_required: requirement.is_required,
      min_years:
        requirement.min_years === null ? null : clamp(requirement.min_years, 0, 50),
    });
  }

  return { extraction, skillRows };
}
