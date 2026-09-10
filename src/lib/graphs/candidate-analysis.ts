import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { GapAnalysis, JdExtraction, QuestionGeneration, ResumeExtraction } from '@/lib/agents/schemas';
import { runEvidenceAgent, type EvidenceItem } from '@/lib/agents/evidence-agent';
import { runGapAnalysisAgent } from '@/lib/agents/gap-analysis-agent';
import { runQuestionAgent } from '@/lib/agents/question-agent';
import { candidateHistoryText } from '@/lib/domain/format';
import { computeCoverage, type CandidateSkillRow, type JobSkillRow } from '@/lib/domain/matching';
import { indexDocument } from '@/lib/ai/vector-store';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { ApiError, notFound } from '@/lib/api/handler';
import { finishRun, NodeTimer, startRun } from '@/lib/graphs/run-log';
import { readAgentMemory, type AgentMemoryNote } from '@/lib/orchestration/memory';

/**
 * Candidate Analysis workflow (Features 3 + 4).
 *
 *   load -> route_analysis -> retrieve_evidence -> gap_analysis
 *        -> retrieve_gap_evidence -> persist_analysis
 *        -> question_generation -> persist_questions
 *
 * The supervisor (route_analysis) inspects coverage signals and candidate
 * seniority to decide analysis depth: minimal (skip evidence), standard,
 * or deep (extra evidence retrieval).
 *
 * Evidence retrieval runs in two passes: once before gap analysis for
 * calibration, and once after for gap-targeted evidence (agentic RAG).
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
  analysisDepth: Annotation<'minimal' | 'standard' | 'deep'>({ reducer: (_, b) => b, default: () => 'standard' }),

  evidence: Annotation<EvidenceItem[]>({ reducer: (_, b) => b, default: () => [] }),
  gapEvidence: Annotation<EvidenceItem[]>({ reducer: (_, b) => b, default: () => [] }),
  peerContext: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  gapCalibration: Annotation<AgentMemoryNote[]>({ reducer: (_, b) => b, default: () => [] }),
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

    const gapCalibration = await readAgentMemory({
      agentName: 'Gap Analysis Agent',
      jobId: state.jobId,
    });

    return {
      job: job.data as JobRecord,
      candidate: candidate.data as CandidateRecord,
      jobSkills: (jobSkills.data ?? []) as JobSkillRow[],
      candidateSkills: (candidateSkills.data ?? []) as CandidateSkillRow[],
      gapCalibration,
    };
  })

  .addNode('route_analysis', async (state) => {
    // Supervisor: inspect the candidate profile and coverage signals to
    // decide how deep the analysis should go.
    //   minimal  — high coverage + senior candidate: skip evidence retrieval
    //   standard — normal path
    //   deep     — low coverage or junior candidate: extra evidence retrieval
    const coverage = computeCoverage(state.jobSkills, state.candidateSkills);
    const years = state.candidate?.total_years_experience ?? 0;

    let depth: 'minimal' | 'standard' | 'deep';
    if (coverage.score >= 80 && years >= 8) {
      depth = 'minimal';
    } else if (coverage.score < 40 || (years > 0 && years < 3)) {
      depth = 'deep';
    } else {
      depth = 'standard';
    }

    console.log(
      `[candidate-analysis] supervisor routing: ${depth} (coverage ${coverage.score}, years ${years})`,
    );
    return { analysisDepth: depth };
  })

  .addNode('load_peer_context', async (state) => {
    // Cross-candidate reasoning: fetch a summary of other candidates in the
    // same job pipeline so the Gap Analysis Agent can differentiate between
    // similarly-matched candidates and prioritise questions that distinguish
    // this candidate from the pool.
    const db = createSupabaseAdminClient();

    try {
      const { data: peers } = await db
        .from('match_analyses')
        .select('candidate_id, match_score, verdict, strong_skills, missing_skills')
        .in(
          'candidate_id',
          (
            await db
              .from('candidates')
              .select('id')
              .eq('job_id', state.jobId)
              .neq('id', state.candidateId)
          ).data?.map((c) => c.id) ?? [],
        )
        .order('match_score', { ascending: false })
        .limit(5);

      if (!peers || peers.length === 0) {
        return { peerContext: '' };
      }

      const summary = peers
        .map((p, i) => {
          const strong = (p.strong_skills ?? []).map((s: { skill: string }) => s.skill).join(', ');
          const missing = (p.missing_skills ?? []).map((s: { skill: string }) => s.skill).join(', ');
          return `Candidate ${i + 1}: match score ${p.match_score}, verdict ${p.verdict ?? 'n/a'}. Strong: ${strong || 'none'}. Missing: ${missing || 'none'}.`;
        })
        .join('\n');

      return {
        peerContext: `OTHER CANDIDATES IN THIS PIPELINE (for differentiation, not comparison):\n${summary}`,
      };
    } catch (error) {
      console.error('[candidate-analysis] peer context load failed, continuing', error);
      return { peerContext: '' };
    }
  })

  .addNode('retrieve_evidence', async (state) => {
    // Skip evidence retrieval for minimal-depth analyses.
    if (state.analysisDepth === 'minimal') {
      console.log('[candidate-analysis] skipping evidence retrieval (minimal depth)');
      return { evidence: [] };
    }

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

  .addNode('gap_analysis', async (state) => {
    const job = state.job!;
    const candidate = state.candidate!;

    const { analysis, coverageScore } = await runGapAnalysisAgent({
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
      peerContext: state.peerContext,
      calibrationNotes: state.gapCalibration,
    });

    return { gap: analysis, coverageScore };
  })

  .addNode('retrieve_gap_evidence', async (state) => {
    // Iterative evidence retrieval (agentic RAG): after the gap analysis
    // identifies missing skills, run a second retrieval pass targeted at
    // those gaps. This gives the question agent historical context on how
    // similar gaps were validated in past interviews.
    const gap = state.gap!;
    const missingSkills = gap.missing_skills.map((s) => s.skill);
    const partialSkills = gap.partial_skills.map((s) => s.skill);

    const gapQuery = [
      `Role: ${state.job!.title}`,
      `Validating gaps for candidate: ${state.candidate!.full_name}`,
      `Missing skills: ${missingSkills.join(', ') || 'none'}`,
      `Partial skills: ${partialSkills.join(', ') || 'none'}`,
      `Areas to validate: ${gap.areas_to_validate.map((a) => a.area).join('; ') || 'none'}`,
    ].join('\n');

    try {
      const gapEvidence = await runEvidenceAgent({
        query: gapQuery,
        excludeCandidateId: state.candidateId,
        ownerTypes: ['knowledge_entry', 'evaluation'],
        limit: state.analysisDepth === 'deep' ? 6 : 3,
        minSimilarity: 0.15,
      });
      return { gapEvidence };
    } catch (error) {
      console.error('[candidate-analysis] gap evidence retrieval failed, continuing', error);
      return { gapEvidence: [] };
    }
  })

  .addNode('question_generation', async (state) => {
    const job = state.job!;
    const candidate = state.candidate!;
    const gap = state.gap!;

    const questions = await runQuestionAgent({
      jobTitle: job.title,
      jobSummary: jobSummary(job),
      requirements: state.jobSkills.map((skill) => skill.skill),
      candidateName: candidate.full_name,
      candidateHeadline: candidate.headline,
      candidateSkills: state.candidateSkills.map((skill) => skill.skill),
      candidateHistory: candidateHistoryText(candidate.structured),
      gap,
      evidence: [...state.evidence, ...state.gapEvidence],
    });

    return { questions };
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
  .addEdge('load', 'route_analysis')
  .addEdge('route_analysis', 'load_peer_context')
  .addEdge('load_peer_context', 'retrieve_evidence')
  .addEdge('retrieve_evidence', 'gap_analysis')
  .addEdge('gap_analysis', 'retrieve_gap_evidence')
  .addEdge('retrieve_gap_evidence', 'persist_analysis')
  .addEdge('persist_analysis', 'question_generation')
  .addEdge('question_generation', 'persist_questions')
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
