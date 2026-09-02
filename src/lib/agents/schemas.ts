import { z } from 'zod';

/**
 * Schemas for every agent's structured output.
 *
 * IMPORTANT: OpenAI strict structured outputs reject JSON-Schema validation
 * keywords (`minimum`, `maximum`, `minLength`, `pattern`, ...). So these
 * schemas describe *shape* only - numeric ranges are enforced afterwards with
 * `clamp()` / `clampRating()`. Do not add `.min()` / `.max()` here.
 */

export const SKILL_CATEGORIES = [
  'skill',
  'technology',
  'experience',
  'certification',
  'domain',
] as const;

export const QUESTION_CATEGORIES = [
  'screening',
  'deep_technical',
  'gap_validation',
  'experience_validation',
] as const;

export const FLAG_CATEGORIES = [
  'seniority_mismatch',
  'project_depth_mismatch',
  'contradiction',
  'unrealistic_claim',
  'timeline_inconsistency',
  'other',
] as const;

export const RECOMMENDATIONS = [
  'strong_hire',
  'hire',
  'lean_hire',
  'no_hire',
  'strong_no_hire',
] as const;

export const REVIEW_DECISIONS = ['advance', 'hold', 'reject', 'hire'] as const;

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export const clampScore = (v: number) => Math.round(clamp(v, 0, 100));
export const clampRating = (v: number) => Math.round(clamp(v, 0, 10) * 10) / 10;
export const clampConfidence = (v: number) => Math.round(clamp(v, 0, 1) * 100) / 100;

// --- Feature 1: JD extraction ----------------------------------------------

export const jdRequirementSchema = z.object({
  label: z.string().describe('Requirement as written in the JD, e.g. "React 18"'),
  category: z.enum(SKILL_CATEGORIES),
  importance: z.number().describe('0-100. How critical this is to the role.'),
  is_required: z.boolean().describe('true for must-have, false for nice-to-have'),
  min_years: z.number().nullable().describe('Years of experience demanded, else null'),
});

export const jdExtractionSchema = z.object({
  title: z.string(),
  seniority: z.string().nullable().describe('e.g. Junior, Mid, Senior, Staff'),
  employment_type: z
    .enum(['full_time', 'part_time', 'contract', 'internship'])
    .nullable(),
  location: z.string().nullable(),
  min_years_experience: z.number().nullable(),
  max_years_experience: z.number().nullable(),
  summary: z.string().describe('Two or three sentences describing the role'),
  responsibilities: z.array(z.string()),
  requirements: z.array(jdRequirementSchema),
  domain_keywords: z.array(z.string()).describe('Industry/domain terms, e.g. "fintech", "HIPAA"'),
});

export type JdExtraction = z.infer<typeof jdExtractionSchema>;

// --- Feature 2: Resume extraction ------------------------------------------

export const resumeSkillSchema = z.object({
  label: z.string(),
  category: z.enum(SKILL_CATEGORIES),
  proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).nullable(),
  years: z.number().nullable(),
  evidence: z.string().nullable().describe('Where in the resume this is supported'),
});

export const resumeExtractionSchema = z.object({
  full_name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  headline: z.string().nullable(),
  total_years_experience: z.number().nullable(),
  summary: z.string(),
  skills: z.array(resumeSkillSchema),
  experience: z.array(
    z.object({
      company: z.string(),
      position: z.string(),
      start_date: z.string().nullable(),
      end_date: z.string().nullable(),
      description: z.string(),
      achievements: z.array(z.string()),
      technologies: z.array(z.string()),
    })
  ),
  projects: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      role: z.string().nullable(),
      technologies: z.array(z.string()),
      impact: z.string().nullable(),
    })
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string(),
      field: z.string().nullable(),
      year: z.string().nullable(),
    })
  ),
  certifications: z.array(
    z.object({
      name: z.string(),
      issuer: z.string().nullable(),
      year: z.string().nullable(),
    })
  ),
});

export type ResumeExtraction = z.infer<typeof resumeExtractionSchema>;

// --- Feature 3: Gap analysis ------------------------------------------------

export const gapAnalysisSchema = z.object({
  match_score: z.number().describe('0-100 weighted by requirement importance'),
  verdict: z.enum(['strong_match', 'partial_match', 'weak_match']),
  strong_skills: z.array(
    z.object({
      skill: z.string(),
      evidence: z.string(),
      importance: z.number(),
    })
  ),
  missing_skills: z.array(
    z.object({
      skill: z.string(),
      importance: z.number(),
      severity: z.enum(['low', 'medium', 'high']),
    })
  ),
  partial_skills: z.array(
    z.object({
      skill: z.string(),
      note: z.string().describe('Why this is only a partial match'),
    })
  ),
  areas_to_validate: z.array(
    z.object({
      area: z.string(),
      why: z.string(),
      suggested_focus: z.string(),
    })
  ),
  summary: z.string(),
});

export type GapAnalysis = z.infer<typeof gapAnalysisSchema>;

// --- Feature 4: Question generation ----------------------------------------

export const questionGenerationSchema = z.object({
  questions: z.array(
    z.object({
      category: z.enum(QUESTION_CATEGORIES),
      question: z.string(),
      rationale: z.string().describe('Why ask this candidate this question'),
      expected_signals: z
        .array(z.string())
        .describe('Concrete keywords/concepts a strong answer contains'),
      target_skill: z.string().nullable(),
      difficulty: z.enum(['easy', 'medium', 'hard']),
    })
  ),
});

export type QuestionGeneration = z.infer<typeof questionGenerationSchema>;

// --- Feature 5: Transcript evaluation --------------------------------------

export const transcriptEvaluationSchema = z.object({
  technical_assessment: z.object({
    score: z.number().describe('0-10'),
    depth: z.string(),
    accuracy: z.string(),
    notes: z.string(),
    evidence: z.array(z.string()).describe('Direct quotes from the transcript'),
  }),
  communication_assessment: z.object({
    score: z.number().describe('0-10'),
    clarity: z.string(),
    structure: z.string(),
    notes: z.string(),
    evidence: z.array(z.string()),
  }),
  overall_rating: z.number().describe('0-10'),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  answer_breakdown: z.array(
    z.object({
      question: z.string(),
      was_asked: z.boolean(),
      score: z.number().describe('0-10'),
      signals_hit: z.array(z.string()),
      signals_missed: z.array(z.string()),
      feedback: z.string(),
    })
  ),
  recommendation: z.enum(RECOMMENDATIONS),
  rationale: z.string(),
});

export type TranscriptEvaluation = z.infer<typeof transcriptEvaluationSchema>;

// --- Feature 6: Red flag detection -----------------------------------------

export const redFlagSchema = z.object({
  level: z.enum(['GREEN', 'YELLOW', 'RED']).describe('Highest severity across all flags'),
  overall_reason: z.string(),
  flags: z.array(
    z.object({
      category: z.enum(FLAG_CATEGORIES),
      level: z.enum(['GREEN', 'YELLOW', 'RED']),
      reason: z.string(),
      evidence: z.array(
        z.object({
          source: z.enum(['resume', 'transcript', 'job']),
          quote: z.string(),
        })
      ),
      confidence: z.number().describe('0-1'),
    })
  ),
});

export type RedFlagAnalysis = z.infer<typeof redFlagSchema>;

// --- Feature 7: Human review synthesis -------------------------------------

export const reviewSynthesisSchema = z.object({
  recommendation: z.enum(REVIEW_DECISIONS),
  confidence: z.number().describe('0-1'),
  headline: z.string().describe('One-line summary for the review queue'),
  reasoning: z.string(),
  key_evidence: z.array(z.string()),
  open_questions: z.array(z.string()).describe('What a human should verify before deciding'),
  comparable_cases: z.array(
    z.object({
      title: z.string(),
      outcome: z.string(),
      why_relevant: z.string(),
    })
  ),
});

export type ReviewSynthesis = z.infer<typeof reviewSynthesisSchema>;
