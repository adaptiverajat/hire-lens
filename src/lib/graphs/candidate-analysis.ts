import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { GapAnalysis, JdExtraction, QuestionGeneration, ResumeExtraction } from '@/lib/agents/schemas';
import { runEvidenceAgent, type EvidenceItem } from '@/lib/agents/evidence-agent';
import { runAnalysisAndQuestionsAgent } from '@/lib/agents/analysis-questions-agent';
import { candidateHistoryText } from '@/lib/domain/format';
import type { CandidateSkillRow, JobSkillRow } from '@/lib/domain/matching';
import { indexDocument } from '@/lib/ai/vector-store';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { ApiError, notFound } from '@/lib/api/handler';
import { finishRun, NodeTimer, startRun } from '@/lib/graphs/run-log';

/**
 * Candidate Analysis workflow (Features 3 + 4).
 *
 *   load -> retrieve_evidence -> gap_analysis -> persist_analysis
 *        -> generate_questions -> persist_questions
 *
 * Evidence retrieval runs before the analysis so the gap assessment and the
 * question set are both grounded in comparable historical cases.
 */

const State = Annotation.Root({
  userId: Annotation<string>(),
  jobId: Annotation<string>(),
  candidateId: Annotation<string>(),
  runId: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),

  job: Annotation<JobRecord | null>({ reducer: (_, b) => b, default: () => null }),
  candidate: Annotation<CandidateRecord | null>({ reducer: (_, b) => b, default: () => null }),
  jobSkills: Annotation<JobSkillRow[]>({ reducer: (_, b) => b, default: () => [] }),
  candidateSkills: Annotation<CandidateSkillRow[]>({ reducer: (_, b) => b, default: () => [] }),

  evidence: Annotation<EvidenceItem[]>({ reducer: (_, b) => b, default: () => [] }),
  gap: Annotation<GapAnalysis | null>({ reducer: (_, b) => b, default: () => null }),
  coverageScore: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  matchAnalysisId: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),

  questions: Annotation<QuestionGeneration | null>({ reducer: (_, b) => b, default: () => null }),
  questionSetId: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
});

interface JobRecord {
  id: string;
  title: string;
  seniority: string | null;
  structured: JdExtraction | null;
  description_raw: string;
}

interface CandidateRecord {
  id: string;
  full_name: string;
  headline: string | null;
  total_years_experience: number | null;
  structured: ResumeExtraction | null;
  resume_raw: string | null;
}

function jobSummary(job: JobRecord): string {
  return job.structured?.summary ?? job.description_raw.slice(0, 2000);
}

const graph = new StateGraph(State)
  .addNode('load', async (state) => {
    const db = createSupabaseAdminClient();

    const [job, candidate, jobSkills, candidateSkills] = await Promise.all([
      db
        .from('jobs')
        .select('id, title, seniority, structured, description_raw')
        .eq('id', state.jobId)
        .eq('created_by', state.userId)
        .maybeSingle(),
      db
        .from('candidates')
        .select('id, full_name, headline, total_years_experience, structured, resume_raw')
        .eq('id', state.candidateId)
        .eq('job_id', state.jobId)
        .maybeSingle(),
      db
        .from('job_skills')
        .select('skill, raw_label, category, importance, is_required, min_years')
        .eq('job_id', state.jobId),
      db
        .from('candidate_skills')
        .select('skill, raw_label, category, proficiency, years, evidence')
        .eq('candidate_id', state.candidateId),
    ]);

    if (!job.data) throw notFound('Job');
    if (!candidate.data) throw notFound('Candidate');
    if (!candidate.data.resume_raw && !candidate.data.structured) {
      throw new ApiError(422, 'Upload and parse a resume before running analysis.');
    }

    return {
      job: job.data as JobRecord,
      candidate: candidate.data as CandidateRecord,
      jobSkills: (jobSkills.data ?? []) as JobSkillRow[],
      candidateSkills: (candidateSkills.data ?? []) as CandidateSkillRow[],
    };
  })

  .addNode('retrieve_evidence', async (state) => {
    const job = state.job!;
    const candidate = state.candidate!;

    const evidence = await runEvidenceAgent({
      query: [
        `Role: ${job.title}`,
        `Requirements: ${state.jobSkills.map((s) => s.skill).join(', ')}`,
        `Candidate profile: ${candidate.headline ?? ''} ${candidate.structured?.summary ?? ''}`,
        `Candidate skills: ${state.candidateSkills.map((s) => s.skill).join(', ')}`,
      ].join('\n'),
      userId: state.userId,
      excludeCandidateId: state.candidateId,
      ownerTypes: ['knowledge_entry', 'evaluation'],
      limit: 4,
    });

    return { evidence };
  })

  .addNode('analyze_and_question', async (state) => {
    const job = state.job!;
    const candidate = state.candidate!;

    const { analysis, coverageScore, questions } = await runAnalysisAndQuestionsAgent({
      jobTitle: job.title,
      jobSummary: jobSummary(job),
      jobSkills: state.jobSkills,
      candidateName: candidate.full_name,
      candidateHeadline: candidate.headline,
      candidateSummary: candidate.structured?.summary ?? '',
      candidateYears: candidate.total_years_experience,
      candidateSkills: state.candidateSkills,
      candidateHistory: candidateHistoryText(candidate.structured),
      evidence: state.evidence,
    });

    return { gap: analysis, coverageScore, questions: { questions } };
  })

  .addNode('persist_analysis', async (state) => {
    const gap = state.gap!;
    const db = createSupabaseAdminClient();

    const { data, error } = await db
      .from('match_analyses')
      .insert({
        job_id: state.jobId,
        candidate_id: state.candidateId,
        match_score: gap.match_score,
        verdict: gap.verdict,
        strong_skills: gap.strong_skills,
        missing_skills: gap.missing_skills,
        areas_to_validate: gap.areas_to_validate,
        summary: gap.summary,
        evidence: state.evidence,
        model: process.env.OPENAI_CHAT_MODEL ?? null,
        run_id: state.runId,
        created_by: state.userId,
      })
      .select('id')
      .single();

    if (error) throw new ApiError(500, `Failed to save match analysis: ${error.message}`);

    // Move the candidate out of 'new' once they have been analysed.
    await db
      .from('candidates')
      .update({ status: 'screening' })
      .eq('id', state.candidateId)
      .eq('status', 'new');

    return { matchAnalysisId: data.id as string };
  })

  .addNode('persist_questions', async (state) => {
    const generated = state.questions!;
    const db = createSupabaseAdminClient();

    const { data: set, error: setError } = await db
      .from('question_sets')
      .insert({
        job_id: state.jobId,
        candidate_id: state.candidateId,
        match_analysis_id: state.matchAnalysisId,
        label: `${state.candidate!.full_name} - ${state.job!.title}`,
        notes: `Generated from match score ${state.gap!.match_score}.`,
        model: process.env.OPENAI_CHAT_MODEL ?? null,
        run_id: state.runId,
        created_by: state.userId,
      })
      .select('id')
      .single();

    if (setError) throw new ApiError(500, `Failed to save question set: ${setError.message}`);

    const rows = generated.questions.map((q, index) => ({
      question_set_id: set.id,
      job_id: state.jobId,
      candidate_id: state.candidateId,
      category: q.category,
      question: q.question,
      rationale: q.rationale,
      expected_signals: q.expected_signals,
      target_skill: q.target_skill,
      difficulty: q.difficulty,
      source: 'generated' as const,
      sort_order: index,
      created_by: state.userId,
    }));

    if (rows.length > 0) {
      const { error } = await db.from('questions').insert(rows);
      if (error) throw new ApiError(500, `Failed to save questions: ${error.message}`);
    }

    // Make the question set retrievable so future runs can learn from it.
    await indexDocument({
      ownerType: 'question',
      ownerId: set.id as string,
      userId: state.userId,
      jobId: state.jobId,
      candidateId: state.candidateId,
      content: generated.questions
        .map((q) => `[${q.category}] ${q.question}\nWhy: ${q.rationale}\nSignals: ${q.expected_signals.join(', ')}`)
        .join('\n\n'),
      metadata: {
        title: `Question set for ${state.job!.title}`,
        job_title: state.job!.title,
        match_score: state.gap!.match_score,
      },
    });

    return { questionSetId: set.id as string };
  })

  .addEdge(START, 'load')
  .addEdge('load', 'retrieve_evidence')
  .addEdge('retrieve_evidence', 'analyze_and_question')
  .addEdge('analyze_and_question', 'persist_analysis')
  .addEdge('persist_analysis', 'persist_questions')
  .addEdge('persist_questions', END);

export const candidateAnalysisGraph = graph.compile();

export interface CandidateAnalysisResult {
  matchAnalysisId: string | null;
  questionSetId: string | null;
  gap: GapAnalysis | null;
  coverageScore: number;
  evidenceCount: number;
  runId: string | null;
}

export async function runCandidateAnalysis(input: {
  userId: string;
  jobId: string;
  candidateId: string;
}): Promise<CandidateAnalysisResult> {
  const timer = new NodeTimer();
  const runId = await startRun({
    workflow: 'candidate_analysis',
    userId: input.userId,
    jobId: input.jobId,
    candidateId: input.candidateId,
  });

  try {
    const result = await timer.track('candidate_analysis', () =>
      candidateAnalysisGraph.invoke(
        { ...input, runId },
        { runName: 'Candidate Analysis', recursionLimit: 20 }
      )
    );

    await finishRun(runId, {
      status: 'complete',
      currentNode: 'persist_questions',
      nodeTimings: timer.results,
      output: {
        match_analysis_id: result.matchAnalysisId,
        question_set_id: result.questionSetId,
        match_score: result.gap?.match_score ?? null,
        coverage_score: result.coverageScore,
        questions_generated: result.questions?.questions.length ?? 0,
      },
    });

    return {
      matchAnalysisId: result.matchAnalysisId,
      questionSetId: result.questionSetId,
      gap: result.gap,
      coverageScore: result.coverageScore,
      evidenceCount: result.evidence.length,
      runId,
    };
  } catch (error) {
    await finishRun(runId, {
      status: 'failed',
      currentNode: timer.current,
      nodeTimings: timer.results,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
