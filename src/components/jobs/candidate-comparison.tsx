import Link from 'next/link';
import { maskName } from '@/lib/utils/mask';
import { ScoreBadge, FlagBadge } from '@/components/shared/indicators';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export interface ComparisonCandidate {
  id: string;
  full_name: string;
  status: string;
  total_years_experience: number | null;
  match_score: number | null;
  verdict: string | null;
  overall_rating: number | null;
  technical_score: number | null;
  communication_score: number | null;
  flag_level: 'GREEN' | 'YELLOW' | 'RED' | null;
  open_flag_count: number;
  recommendation: string | null;
  final_decision: string | null;
}

export function CandidateComparison({
  candidates,
  demo,
}: {
  candidates: ComparisonCandidate[];
  demo: boolean;
}) {
  const interviewed = candidates.filter(
    (c) => c.overall_rating !== null || c.match_score !== null
  );

  if (interviewed.length < 2) {
    return (
      <Card id="job-comparison-card">
        <CardHeader>
          <CardTitle>Candidate comparison</CardTitle>
          <CardDescription>
            Side-by-side comparison of interviewed candidates for this role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            At least two analysed or interviewed candidates are needed for comparison.
            Currently {interviewed.length} candidate{interviewed.length === 1 ? ' is' : 's are'} eligible.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Sort by overall rating (desc), then match score (desc).
  const sorted = [...interviewed].sort((a, b) => {
    const aScore = (a.overall_rating ?? 0) * 10 + (a.match_score ?? 0);
    const bScore = (b.overall_rating ?? 0) * 10 + (b.match_score ?? 0);
    return bScore - aScore;
  });

  const bestRating = Math.max(...sorted.map((c) => c.overall_rating ?? 0));
  const bestMatch = Math.max(...sorted.map((c) => c.match_score ?? 0));

  return (
    <Card id="job-comparison-card">
      <CardHeader>
        <CardTitle>Candidate comparison</CardTitle>
        <CardDescription>
          {sorted.length} candidates ranked by interview rating then evidence match.
          Green bars highlight the best score in each column.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Candidate</th>
                <th className="pb-2 pr-4 font-medium">Evidence match</th>
                <th className="pb-2 pr-4 font-medium">Interview</th>
                <th className="pb-2 pr-4 font-medium">Technical</th>
                <th className="pb-2 pr-4 font-medium">Communication</th>
                <th className="pb-2 pr-4 font-medium">Flags</th>
                <th className="pb-2 pr-4 font-medium">Decision</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const isBestRating = c.overall_rating !== null && c.overall_rating === bestRating;
                const isBestMatch = c.match_score !== null && c.match_score === bestMatch;
                return (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-3 pr-4">
                      <Link
                        href={`/candidates/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {maskName(c.full_name, demo) ?? c.full_name}
                      </Link>
                      {c.total_years_experience !== null && (
                        <p className="text-xs text-muted-foreground">
                          {c.total_years_experience} yrs exp
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {c.match_score !== null ? (
                        <div className="space-y-1">
                          <ScoreBadge score={c.match_score} />
                          {c.verdict && (
                            <p className="text-xs text-muted-foreground">
                              {c.verdict.replace('_', ' ')}
                            </p>
                          )}
                          {isBestMatch && (
                            <p className="text-xs font-medium text-emerald-600">Top match</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {c.overall_rating !== null ? (
                        <div className="space-y-1">
                          <span className={`font-semibold tabular-nums ${isBestRating ? 'text-emerald-600' : ''}`}>
                            {c.overall_rating}/10
                          </span>
                          {isBestRating && (
                            <p className="text-xs font-medium text-emerald-600">Top rated</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {c.technical_score !== null ? (
                        <div className="w-20 space-y-1">
                          <span className="text-xs tabular-nums">{c.technical_score}/10</span>
                          <Progress value={c.technical_score * 10} className="h-1.5" />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {c.communication_score !== null ? (
                        <div className="w-20 space-y-1">
                          <span className="text-xs tabular-nums">{c.communication_score}/10</span>
                          <Progress value={c.communication_score * 10} className="h-1.5" />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1.5">
                        <FlagBadge level={c.flag_level} />
                        {c.open_flag_count > 0 && (
                          <Badge
                            variant={c.flag_level === 'RED' ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {c.open_flag_count}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      {c.final_decision ? (
                        <Badge
                          variant={
                            c.final_decision === 'reject' ? 'destructive' :
                            c.final_decision === 'advance' || c.final_decision === 'hire' ? 'default' :
                            'secondary'
                          }
                        >
                          {c.final_decision === 'advance' ? 'Selected' :
                           c.final_decision === 'reject' ? 'Rejected' :
                           c.final_decision === 'hire' ? 'Hired' :
                           c.final_decision === 'hold' ? 'On Hold' :
                           c.final_decision}
                        </Badge>
                      ) : c.recommendation ? (
                        <Badge variant="outline" className="font-normal">
                          {c.recommendation.replace(/_/g, ' ')}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
