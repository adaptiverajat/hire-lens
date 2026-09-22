import { CheckCircle2, CircleAlert, CircleHelp } from 'lucide-react';
import { EmptyState } from '@/components/shared/indicators';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { displaySkill } from '@/lib/domain/skills';
import type { CandidateRow, CandidateSkillRowFull, MatchAnalysisRow } from '@/types/domain';

export function AnalysisPanel({
  candidate,
  skills,
  analysis,
  jobParsed,
}: {
  candidate: CandidateRow;
  skills: CandidateSkillRowFull[];
  analysis: MatchAnalysisRow | null;
  jobParsed: boolean;
}) {
  const structured = candidate.structured;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {analysis ? (
          <>
            <Card id="analysis-match-card">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Match analysis</CardTitle>
                    <CardDescription>
                      Weighted against this job&apos;s requirements.{' '}
                      {analysis.evidence?.length > 0
                        ? `Calibrated against ${analysis.evidence.length} historical case(s).`
                        : 'No historical cases were available for calibration.'}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Evidence match
                    </p>
                    <p className="text-3xl font-semibold tabular-nums">{analysis.match_score}%</p>
                    {analysis.verdict && (
                      <p className="text-xs text-muted-foreground">
                        {analysis.verdict.replace('_', ' ')}
                      </p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={analysis.match_score} />
                {analysis.summary && <p className="text-sm">{analysis.summary}</p>}
              </CardContent>
            </Card>

            <div className="grid gap-6 sm:grid-cols-2">
              <Card id="analysis-strong-areas-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
                    Strong areas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analysis.strong_skills.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None identified.</p>
                  ) : (
                    <ul className="space-y-3 text-sm">
                      {analysis.strong_skills.map((s, i) => (
                        <li key={i}>
                          <p className="font-medium">{displaySkill(s.skill)}</p>
                          <p className="text-muted-foreground">{s.evidence}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card id="analysis-gaps-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CircleAlert className="size-4 text-amber-600" aria-hidden />
                    Gaps
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analysis.missing_skills.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No mandatory requirements are missing.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {analysis.missing_skills.map((s, i) => (
                        <li key={i} className="flex items-center justify-between gap-2">
                          <span>{displaySkill(s.skill)}</span>
                          <Badge
                            variant={s.severity === 'high' ? 'destructive' : 'secondary'}
                            className="shrink-0"
                          >
                            {s.severity}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            {analysis.areas_to_validate.length > 0 && (
              <Card id="analysis-validate-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CircleHelp className="size-4 text-blue-600" aria-hidden />
                    Validate in interview
                  </CardTitle>
                  <CardDescription>
                    Things the resume leaves ambiguous that a conversation can settle.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-4 text-sm">
                    {analysis.areas_to_validate.map((a, i) => (
                      <li key={i}>
                        <p className="font-medium">{a.area}</p>
                        <p className="text-muted-foreground">{a.why}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Focus: {a.suggested_focus}</p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <EmptyState
            title="Not analysed yet"
            description={
              jobParsed
                ? 'Run Analyse candidate to compare this resume against the job requirements and generate an interview question set.'
                : 'Parse the job description first, then analyse this candidate.'
            }
          />
        )}

        {structured && (
          <Card id="analysis-parsed-profile-card">
            <CardHeader>
              <CardTitle>Parsed profile</CardTitle>
              <CardDescription>Extracted by the Resume Agent.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 text-sm">
              <p>{structured.summary}</p>

              {structured.experience.length > 0 && (
                <section id="analysis-experience-section">
                  <h3 className="mb-2 font-medium">Experience</h3>
                  <ul className="space-y-4">
                    {structured.experience.map((role, i) => (
                      <li key={i}>
                        <p className="font-medium">
                          {role.position} · {role.company}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[role.start_date, role.end_date].filter(Boolean).join(' - ') ||
                            'Dates not stated'}
                        </p>
                        <p className="mt-1 text-muted-foreground">{role.description}</p>
                        {role.technologies.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {role.technologies.map((t) => (
                              <Badge key={t} variant="outline" className="font-normal">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {structured.projects.length > 0 && (
                <section id="analysis-projects-section">
                  <h3 className="mb-2 font-medium">Projects</h3>
                  <ul className="space-y-3">
                    {structured.projects.map((project, i) => (
                      <li key={i}>
                        <p className="font-medium">
                          {project.name}
                          {project.role && (
                            <span className="text-muted-foreground"> · {project.role}</span>
                          )}
                        </p>
                        <p className="text-muted-foreground">{project.description}</p>
                        {project.impact && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Impact: {project.impact}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="grid gap-6 sm:grid-cols-2">
                {structured.education.length > 0 && (
                  <section id="analysis-education-section">
                    <h3 className="mb-2 font-medium">Education</h3>
                    <ul className="space-y-1 text-muted-foreground">
                      {structured.education.map((e, i) => (
                        <li key={i}>
                          {e.degree}
                          {e.field ? ` in ${e.field}` : ''} · {e.institution}
                          {e.year ? ` (${e.year})` : ''}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {structured.certifications.length > 0 && (
                  <section id="analysis-certifications-section">
                    <h3 className="mb-2 font-medium">Certifications</h3>
                    <ul className="space-y-1 text-muted-foreground">
                      {structured.certifications.map((c, i) => (
                        <li key={i}>
                          {c.name}
                          {c.issuer ? ` · ${c.issuer}` : ''}
                          {c.year ? ` (${c.year})` : ''}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-6">
        <Card id="analysis-skills-card">
          <CardHeader>
            <CardTitle>Normalised skills</CardTitle>
            <CardDescription>{skills.length} extracted and canonicalised.</CardDescription>
          </CardHeader>
          <CardContent>
            {skills.length === 0 ? (
              <p className="text-sm text-muted-foreground">Parse the resume to extract skills.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <Badge
                    key={skill.id}
                    variant="secondary"
                    className="font-normal"
                    title={
                      [
                        skill.raw_label && `As written: ${skill.raw_label}`,
                        skill.years && `${skill.years} years`,
                        skill.proficiency,
                        skill.evidence,
                      ]
                        .filter(Boolean)
                        .join('\n') || undefined
                    }
                  >
                    {displaySkill(skill.skill)}
                    {skill.years ? (
                      <span className="ml-1 text-muted-foreground">{skill.years}y</span>
                    ) : null}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {candidate.resume_raw && (
          <Card id="analysis-resume-text-card">
            <CardHeader>
              <CardTitle>Resume text</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="max-h-80 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">
                {candidate.resume_raw}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
