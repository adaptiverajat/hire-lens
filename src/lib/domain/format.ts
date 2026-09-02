import type { JdExtraction, ResumeExtraction } from '@/lib/agents/schemas';

/** Narrative of employment + projects, for prompts and for embedding. */
export function candidateHistoryText(structured: ResumeExtraction | null): string {
  if (!structured) return 'No structured profile available.';

  const sections: string[] = [];

  if (structured.experience.length) {
    sections.push(
      'EMPLOYMENT\n' +
        structured.experience
          .map((role) => {
            const period = [role.start_date, role.end_date].filter(Boolean).join(' to ') || 'dates not stated';
            const lines = [
              `${role.position} at ${role.company} (${period})`,
              role.description,
            ];
            if (role.achievements.length) {
              lines.push(`Achievements: ${role.achievements.join('; ')}`);
            }
            if (role.technologies.length) {
              lines.push(`Technologies: ${role.technologies.join(', ')}`);
            }
            return lines.filter(Boolean).join('\n  ');
          })
          .join('\n\n')
    );
  }

  if (structured.projects.length) {
    sections.push(
      'PROJECTS\n' +
        structured.projects
          .map((project) => {
            const lines = [
              `${project.name}${project.role ? ` (${project.role})` : ''}`,
              project.description,
            ];
            if (project.technologies.length) {
              lines.push(`Technologies: ${project.technologies.join(', ')}`);
            }
            if (project.impact) lines.push(`Impact: ${project.impact}`);
            return lines.filter(Boolean).join('\n  ');
          })
          .join('\n\n')
    );
  }

  if (structured.education.length) {
    sections.push(
      'EDUCATION\n' +
        structured.education
          .map(
            (e) =>
              `${e.degree}${e.field ? ` in ${e.field}` : ''}, ${e.institution}${
                e.year ? ` (${e.year})` : ''
              }`
          )
          .join('\n')
    );
  }

  if (structured.certifications.length) {
    sections.push(
      'CERTIFICATIONS\n' +
        structured.certifications
          .map(
            (c) => `${c.name}${c.issuer ? ` - ${c.issuer}` : ''}${c.year ? ` (${c.year})` : ''}`
          )
          .join('\n')
    );
  }

  return sections.join('\n\n') || 'No structured profile available.';
}

/** Compact resume profile used by the red flag agent. */
export function resumeProfileText(structured: ResumeExtraction | null): string {
  if (!structured) return 'No structured profile available.';

  return [
    `Summary: ${structured.summary}`,
    structured.headline ? `Headline: ${structured.headline}` : null,
    structured.total_years_experience !== null
      ? `Stated total experience: ${structured.total_years_experience} years`
      : null,
    `Skills claimed: ${structured.skills.map((s) => s.label).join(', ') || 'none'}`,
    candidateHistoryText(structured),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Text used to embed a job for retrieval. */
export function jobEmbeddingText(
  title: string,
  structured: JdExtraction | null,
  raw: string
): string {
  if (!structured) return `Job: ${title}\n\n${raw}`;

  return [
    `Job: ${title}`,
    structured.seniority ? `Seniority: ${structured.seniority}` : null,
    `Summary: ${structured.summary}`,
    `Responsibilities: ${structured.responsibilities.join('; ')}`,
    `Requirements: ${structured.requirements.map((r) => r.label).join(', ')}`,
    `Domain: ${structured.domain_keywords.join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Text used to embed a candidate for retrieval. */
export function candidateEmbeddingText(
  name: string,
  structured: ResumeExtraction | null,
  raw: string | null
): string {
  if (!structured) return `Candidate: ${name}\n\n${raw ?? ''}`;
  return [`Candidate: ${name}`, resumeProfileText(structured)].join('\n');
}
