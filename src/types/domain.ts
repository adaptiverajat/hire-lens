import type {
  GapAnalysis,
  JdExtraction,
  RedFlagAnalysis,
  ResumeExtraction,
  TranscriptEvaluation,
} from '@/lib/agents/schemas';

export type CandidateStatus =
  | 'new'
  | 'screening'
  | 'interviewing'
  | 'offer'
  | 'hired'
  | 'rejected'
  | 'on_hold';

export type ParseStatus = 'pending' | 'processing' | 'complete' | 'failed';

export interface JobRow {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  seniority: string | null;
  status: 'draft' | 'open' | 'on_hold' | 'closed';
  priority: 'normal' | 'urgent';
  parse_status: ParseStatus;
  parse_error: string | null;
  description_raw: string;
  structured: JdExtraction | null;
  deadline_date: string | null;
  created_at: string;
}

export interface JobSkillRowFull {
  id: string;
  skill: string;
  raw_label: string | null;
  category: string;
  importance: number;
  is_required: boolean;
  min_years: number | null;
}

export interface CandidateRow {
  id: string;
  job_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  headline: string | null;
  total_years_experience: number | null;
  resume_raw: string | null;
  structured: ResumeExtraction | null;
  status: CandidateStatus;
  parse_status: ParseStatus;
  parse_error: string | null;
  created_at: string;
}

export interface CandidateSkillRowFull {
  id: string;
  skill: string;
  raw_label: string | null;
  category: string;
  proficiency: string | null;
  years: number | null;
  evidence: string | null;
}

export interface MatchAnalysisRow {
  id: string;
  match_score: number;
  verdict: string | null;
  strong_skills: GapAnalysis['strong_skills'];
  missing_skills: GapAnalysis['missing_skills'];
  areas_to_validate: GapAnalysis['areas_to_validate'];
  summary: string | null;
  evidence: Array<{ title: string; similarity: number; outcome: string | null }>;
  created_at: string;
}

export type QuestionCategory =
  | 'screening'
  | 'deep_technical'
  | 'gap_validation'
  | 'experience_validation';

export interface QuestionRow {
  id: string;
  category: QuestionCategory;
  question: string;
  rationale: string | null;
  expected_signals: string[];
  target_skill: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  source: 'generated' | 'recruiter' | 'library';
  sort_order: number;
}

export interface QuestionSetRow {
  id: string;
  label: string;
  notes: string | null;
  created_at: string;
  questions: QuestionRow[];
}

export interface TranscriptRow {
  id: string;
  source: string;
  word_count: number | null;
  participants: string[];
  created_at: string;
}

export interface InterviewRow {
  id: string;
  candidate_id: string;
  round: number;
  stage: string;
  status: string;
  scheduled_at: string | null;
  interviewer_name: string | null;
  created_at: string;
  transcripts: TranscriptRow[];
}

export interface EvaluationRow {
  id: string;
  candidate_id: string;
  transcript_id: string;
  interview_id: string;
  technical_assessment: TranscriptEvaluation['technical_assessment'];
  communication_assessment: TranscriptEvaluation['communication_assessment'];
  overall_rating: number;
  strengths: string[];
  weaknesses: string[];
  answer_breakdown: TranscriptEvaluation['answer_breakdown'];
  recommendation: TranscriptEvaluation['recommendation'];
  rationale: string | null;
  created_at: string;
}

export interface FlagRowFull {
  id: string;
  candidate_id: string;
  level: 'GREEN' | 'YELLOW' | 'RED';
  category: RedFlagAnalysis['flags'][number]['category'];
  reason: string;
  evidence: Array<{ source: string; quote: string }>;
  confidence: number | null;
  status: 'open' | 'in_review' | 'resolved' | 'dismissed';
  evaluation_id: string | null;
  created_at: string;
}

export interface FeedbackRow {
  id: string;
  candidate_id: string;
  decision: 'accept' | 'override';
  agent_recommendation: string | null;
  final_decision: 'advance' | 'hold' | 'reject' | 'hire';
  notes: string;
  created_at: string;
}

export interface KnowledgeEntryRow {
  id: string;
  kind: string;
  title: string;
  content: string;
  outcome: string | null;
  created_at: string;
  jobs: { title: string } | null;
  candidates: { full_name: string } | null;
}

export const QUESTION_CATEGORY_LABELS: Record<QuestionCategory, string> = {
  screening: 'Screening',
  deep_technical: 'Deep technical',
  gap_validation: 'Gap validation',
  experience_validation: 'Experience validation',
};

export const RECOMMENDATION_LABELS: Record<string, string> = {
  strong_hire: 'Strong hire',
  hire: 'Hire',
  lean_hire: 'Lean hire',
  no_hire: 'No hire',
  strong_no_hire: 'Strong no hire',
};

export const FLAG_CATEGORY_LABELS: Record<string, string> = {
  seniority_mismatch: 'Seniority mismatch',
  project_depth_mismatch: 'Project depth mismatch',
  contradiction: 'Contradiction',
  unrealistic_claim: 'Unrealistic claim',
  timeline_inconsistency: 'Timeline inconsistency',
  other: 'Other',
};
