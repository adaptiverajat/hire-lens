import { normaliseSkill } from '@/lib/domain/skills';

export interface JobSkillRow {
  skill: string;
  raw_label: string | null;
  category: string;
  importance: number;
  is_required: boolean;
  min_years: number | null;
}

export interface CandidateSkillRow {
  skill: string;
  raw_label: string | null;
  category: string;
  proficiency: string | null;
  years: number | null;
  evidence: string | null;
}

export interface CoverageResult {
  /** Importance-weighted coverage, 0-100. Deterministic and reproducible. */
  score: number;
  matched: Array<{ skill: string; importance: number; candidateYears: number | null }>;
  missing: Array<{ skill: string; importance: number; isRequired: boolean }>;
  extra: string[];
  requiredCoverage: number;
}

/**
 * Deterministic skill overlap between a job and a candidate.
 *
 * This is intentionally not an LLM call: the numeric score must be stable
 * across runs and auditable. The Gap Analysis Agent receives this as an anchor
 * and supplies the qualitative reasoning around it.
 *
 * Matching strategy (best of all, highest credit wins):
 * 1. Exact normalised match (credit = 1.0)
 * 2. Substring match — "react hooks" vs "react" (credit = 0.7)
 * 3. Token overlap — "amazon web services" vs "aws ec2" (credit = 0.5)
 */
export function computeCoverage(
  jobSkills: JobSkillRow[],
  candidateSkills: CandidateSkillRow[]
): CoverageResult {
  const candidateIndex = new Map<string, CandidateSkillRow>();
  for (const skill of candidateSkills) {
    const key = normaliseSkill(skill.skill);
    if (key) candidateIndex.set(key, skill);
  }

  const candidateTokens = new Map<string, string[]>();
  for (const key of candidateIndex.keys()) {
    candidateTokens.set(key, key.split(/\s+/).filter(Boolean));
  }

  const matched: CoverageResult['matched'] = [];
  const missing: CoverageResult['missing'] = [];

  let totalWeight = 0;
  let earnedWeight = 0;
  let requiredTotal = 0;
  let requiredEarned = 0;

  for (const requirement of jobSkills) {
    const key = normaliseSkill(requirement.skill);
    if (!key) continue;

    // Nice-to-haves count for less than must-haves at equal importance.
    const weight = Math.max(requirement.importance, 1) * (requirement.is_required ? 1 : 0.5);
    totalWeight += weight;
    if (requirement.is_required) requiredTotal += weight;

    // 1. Exact match
    let hit = candidateIndex.get(key);
    let credit = 0;

    if (hit) {
      credit = 1;
    } else {
      // 2. Substring match — one normalised token contains the other.
      //    e.g. "react hooks" (job) vs "react" (candidate) or vice-versa.
      let bestSubstringCredit = 0;
      for (const [candKey] of candidateIndex) {
        if (candKey === key) continue;
        if (candKey.length < 2 || key.length < 2) continue;
        if (candKey.includes(key) || key.includes(candKey)) {
          // Shorter string relative to longer = stronger match.
          const shorter = Math.min(candKey.length, key.length);
          const longer = Math.max(candKey.length, key.length);
          bestSubstringCredit = Math.max(bestSubstringCredit, 0.7 * (shorter / longer));
        }
      }
      if (bestSubstringCredit > 0) {
        credit = bestSubstringCredit;
        // Find the candidate skill for years-check.
        for (const [candKey, candSkill] of candidateIndex) {
          if (candKey !== key && (candKey.includes(key) || key.includes(candKey))) {
            hit = candSkill;
            break;
          }
        }
      }
    }

    if (credit === 0) {
      // 3. Token overlap — shared words between multi-word tokens.
      //    e.g. "amazon web services" vs "aws ec2" won't match, but
      //    "sql server administration" vs "sql server" will.
      const reqTokens = key.split(/\s+/).filter(Boolean);
      if (reqTokens.length > 1) {
        let bestTokenCredit = 0;
        for (const [candKey, candTokens] of candidateTokens) {
          if (candKey === key) continue;
          const overlap = reqTokens.filter((t) => candTokens.includes(t)).length;
          if (overlap > 0) {
            const ratio = overlap / Math.max(reqTokens.length, candTokens.length);
            bestTokenCredit = Math.max(bestTokenCredit, 0.5 * ratio);
          }
        }
        if (bestTokenCredit > 0) {
          credit = bestTokenCredit;
        }
      }
    }

    if (credit > 0 && hit) {
      // Partial credit when the JD demands more years than the resume shows.
      if (requirement.min_years !== null && hit.years !== null && hit.years < requirement.min_years) {
        credit *= Math.max(0.4, hit.years / requirement.min_years);
      }

      earnedWeight += weight * credit;
      if (requirement.is_required) requiredEarned += weight * credit;
      matched.push({
        skill: key,
        importance: requirement.importance,
        candidateYears: hit.years,
      });
    } else {
      missing.push({
        skill: key,
        importance: requirement.importance,
        isRequired: requirement.is_required,
      });
    }
  }

  const jobKeys = new Set(jobSkills.map((s) => normaliseSkill(s.skill)));
  const extra = [...candidateIndex.keys()].filter((k) => k && !jobKeys.has(k));

  return {
    score: totalWeight === 0 ? 0 : Math.round((earnedWeight / totalWeight) * 100),
    matched: matched.sort((a, b) => b.importance - a.importance),
    missing: missing.sort((a, b) => b.importance - a.importance),
    extra,
    requiredCoverage:
      requiredTotal === 0 ? 0 : Math.round((requiredEarned / requiredTotal) * 100),
  };
}

/** Keeps the model's score honest relative to the deterministic anchor. */
export function reconcileScore(anchor: number, modelScore: number, tolerance = 35): number {
  const lower = Math.max(0, anchor - tolerance);
  const upper = Math.min(100, anchor + tolerance);
  return Math.round(Math.min(upper, Math.max(lower, modelScore)));
}
