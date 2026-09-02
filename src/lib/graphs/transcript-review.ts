import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type {
  JdExtraction,
  RedFlagAnalysis,
  ResumeExtraction,
  ReviewSynthesis,
  TranscriptEvaluation,
} from '@/lib/agents/schemas';
import { runEvidenceAgent, type EvidenceItem } from '@/lib/agents/evidence-agent';
import { runTranscriptAgent, type PlannedQuestion } from '@/lib/agents/transcript-agent';
import { runRedFlagAgent } from '@/lib/agents/red-flag-agent';
import { runReviewAgent } from '@/lib/agents/review-agent';
import { resumeProfileText } from '@/lib/domain/format';
import { indexDocument } from '@/lib/ai/vector-store';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { ApiError, notFound } from '@/lib/api/handler';
import { finishRun, NodeTimer, startRun } from '@/lib/graphs/run-log';

/**
 * Transcript Review workflow (Features 5 + 6 + 7).
 *
 *   load -> retrieve_evidence -> evaluate_transcript -> persist_evaluation
 *        -> detect_red_flags -> persist_flags -> synthesise_review
 *        -> persist_knowledge
 *
 * Nothing here rejects a candidate. The output is a recommendation plus flags,
 * queued for a human to accept or override.
 */

const State = Annotation.Root({
  userId: Annotation<string>(),
  transcriptId: Annotation<string>(),
  runId: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),

  jobId: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  candidateId: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  interviewId: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),

  job: Annotation<JobRecord | null>({ reducer: (_, b) => b, default: () => null }),
  candidate: Annotation<CandidateRecord | null>({ reducer: (_, b) => b, default: () => null }),
  transcriptText: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  participants: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
  plannedQuestions: Annotation<PlannedQuestion[]>({ reducer: (_, b) => b, default: () => [] }),
  requirements: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
  matchSummary: Annotation<MatchSummary | null>({ reducer: (_, b) => b, default: () => null }),

  evidence: Annotation<EvidenceItem[]>({ reducer: (_, b) => b, default: () => [] }),
  evaluation: Annotation<TranscriptEvaluation | null>({ reducer: (_, b) => b, default: () => null }),
  evaluationId: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  redFlags: Annotation<RedFlagAnalysis | null>({ reducer: (_, b) => b, default: () => null }),
  flagIds: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
  review: Annotation<ReviewSynthesis | null>({ reducer: (_, b) => b, default: () => null }),
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
  status: string;
  structured: ResumeExtraction | null;
}

interface MatchSummary {
  match_score: number;
  verdict: string | null;
  summary: string | null;
  strong_skills: Array<{ skill: string }>;
  missing_skills: Array<{ skill: string }>;
}

function jobSummary(job: JobRecord): string {
  return job.structured?.summary ?? job.description_raw.slice(0, 2000);
}

const graph = new StateGraph(State)
  .addNode('load', async (state) => {
    const db = createSupabaseAdminClient();

    const { data: transcript } = await db
      .from('transcripts')
      .select('id, raw_text, participants, interview_id, interviews!inner(id, job_id, candidate_id, question_set_id)')
      .eq('id', state.transcriptId)
      .maybeSingle();

    if (!transcript) throw notFound('Transcript');

    const interview = (transcript as Record<string, unknown>).interviews as {
      id: string;
      job_id: string;
      candidate_id: string;
      question_set_id: string | null;
    };

    const [job, candidate, jobSkills, questions, analysis] = await Promise.all([
      db
        .from('jobs')
        .select('id, title, seniority, structured, description_raw')
        .eq('id', interview.job_id)
        .eq('created_by', state.userId)
        .maybeSingle(),
      db
        .from('candidates')
        .select('id, full_name, headline, total_years_experience, status, structured')
        .eq('id', interview.candidate_id)
        .maybeSingle(),
      db.from('job_skills').select('skill').eq('job_id', interview.job_id),
      interview.question_set_id
        ? db
            .from('questions')
            .select('question, category, expected_signals')
            .eq('question_set_id', interview.question_set_id)
            .order('sort_order')
        : db
            .from('questions')
            .select('question, category, expected_signals')
            .eq('candidate_id', interview.candidate_id)
            .order('created_at', { ascending: false })
            .limit(30),
      db
        .from('match_analyses')
        .select('match_score, verdict, summary, strong_skills, missing_skills')
        .eq('candidate_id', interview.candidate_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Ownership is enforced through the job: no job, no access.
    if (!job.data) throw notFound('Job');
    if (!candidate.data) throw notFound('Candidate');

    const rawText = (transcript as Record<string, unknown>).raw_text as string;
    if (!rawText?.trim()) {
      throw new ApiError(422, 'Transcript is empty.');
    }

    return {
      jobId: interview.job_id,
      candidateId: interview.candidate_id,
      interviewId: interview.id,
      job: job.data as JobRecord,
      candidate: candidate.data as CandidateRecord,
      transcriptText: rawText,
      participants: ((transcript as Record<string, unknown>).participants as string[]) ?? [],
      plannedQuestions: (questions.data ?? []) as PlannedQuestion[],
      requirements: (jobSkills.data ?? []).map((s: { skill: string }) => s.skill),
      matchSummary: (analysis.data as MatchSummary | null) ?? null,
    };
  })

  .addNode('retrieve_evidence', async (state) => {
    const evidence = await runEvidenceAgent({
      query: [
        `Role: ${state.job!.title}`,
        `Interview assessment for a candidate with skills: ${state.requirements.join(', ')}`,
        `Candidate profile: ${state.candidate!.headline ?? ''}`,
        state.matchSummary?.summary ?? '',
      ].join('\n'),
      userId: state.userId,
      excludeCandidateId: state.candidateId,
      ownerTypes: ['knowledge_entry', 'evaluation'],
      limit: 6,
    });

    return { evidence };
  })

  .addNode('evaluate_transcript', async (state) => {
    const evaluation = await runTranscriptAgent({
      jobTitle: state.job!.title,
      jobSummary: jobSummary(state.job!),
      requirements: state.requirements,
      candidateName: state.candidate!.full_name,
      candidateSummary: state.candidate!.structured?.summary ?? 'not available',
      questions: state.plannedQuestions,
      transcript: state.transcriptText,
      participants: state.participants,
      evidence: state.evidence,
    });

    return { evaluation };
  })

  .addNode('persist_evaluation', async (state) => {
    const evaluation = state.evaluation!;

    const { data, error } = await createSupabaseAdminClient()
      .from('evaluations')
      .insert({
        transcript_id: state.transcriptId,
        interview_id: state.interviewId,
        job_id: state.jobId,
        candidate_id: state.candidateId,
        technical_assessment: evaluation.technical_assessment,
        communication_assessment: evaluation.communication_assessment,
        overall_rating: evaluation.overall_rating,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses,
        answer_breakdown: evaluation.answer_breakdown,
        recommendation: evaluation.recommendation,
        rationale: evaluation.rationale,
        evidence: state.evidence,
        model: process.env.OPENAI_CHAT_MODEL ?? null,
        run_id: state.runId,
        created_by: state.userId,
      })
      .select('id')
      .single();

    if (error) throw new ApiError(500, `Failed to save evaluation: ${error.message}`);
    return { evaluationId: data.id as string };
  })

  .addNode('detect_red_flags', async (state) => {
    const evaluation = state.evaluation!;

    const redFlags = await runRedFlagAgent({
      jobTitle: state.job!.title,
      seniority: state.job!.seniority,
      requirements: state.requirements,
      candidateName: state.candidate!.full_name,
      candidateYears: state.candidate!.total_years_experience,
      candidateHeadline: state.candidate!.headline,
      resumeProfile: resumeProfileText(state.candidate!.structured),
      transcript: state.transcriptText,
      technicalScore: evaluation.technical_assessment.score,
      communicationScore: evaluation.communication_assessment.score,
      strengths: evaluation.strengths,
      weaknesses: evaluation.weaknesses,
    });

    return { redFlags };
  })

  .addNode('persist_flags', async (state) => {
    const redFlags = state.redFlags!;
    const db = createSupabaseAdminClient();

    interface FlagRow {
      job_id: string;
      candidate_id: string;
      evaluation_id: string | null;
      level: 'GREEN' | 'YELLOW' | 'RED';
      category: RedFlagAnalysis['flags'][number]['category'];
      reason: string;
      evidence: unknown[];
      confidence: number | null;
      status: 'open' | 'resolved';
      model: string | null;
      run_id: string | null;
    }

    const base = {
      job_id: state.jobId,
      candidate_id: state.candidateId,
      evaluation_id: state.evaluationId,
      model: process.env.OPENAI_CHAT_MODEL ?? null,
      run_id: state.runId,
    };

    // A GREEN result still gets a row so the review queue can show "checked, clear".
    const rows: FlagRow[] =
      redFlags.flags.length > 0
        ? redFlags.flags.map((f) => ({
            ...base,
            level: f.level,
            category: f.category,
            reason: f.reason,
            evidence: f.evidence,
            confidence: f.confidence,
            status: f.level === 'GREEN' ? 'resolved' : 'open',
          }))
        : [
            {
              ...base,
              level: 'GREEN',
              category: 'other',
              reason:
                redFlags.overall_reason ||
                'No inconsistencies detected between resume and interview.',
              evidence: [],
              confidence: null,
              status: 'resolved',
            },
          ];

    const { data, error } = await db.from('flags').insert(rows).select('id');
    if (error) throw new ApiError(500, `Failed to save flags: ${error.message}`);

    return { flagIds: (data ?? []).map((r: { id: string }) => r.id) };
  })

  .addNode('synthesise_review', async (state) => {
    const review = await runReviewAgent({
      jobTitle: state.job!.title,
      jobSummary: jobSummary(state.job!),
      candidateName: state.candidate!.full_name,
      candidateStatus: state.candidate!.status,
      matchScore: state.matchSummary?.match_score ?? null,
      verdict: state.matchSummary?.verdict ?? null,
      matchSummary: state.matchSummary?.summary ?? null,
      strongSkills: (state.matchSummary?.strong_skills ?? []).map((s) => s.skill),
      missingSkills: (state.matchSummary?.missing_skills ?? []).map((s) => s.skill),
      evaluation: state.evaluation,
      redFlags: state.redFlags,
      evidence: state.evidence,
    });

    return { review };
  })

  .addNode('persist_knowledge', async (state) => {
    const db = createSupabaseAdminClient();
    const evaluation = state.evaluation!;
    const review = state.review!;

    // Move the candidate into the interviewing stage; the final decision stays
    // with the human reviewer.
    await db
      .from('candidates')
      .update({ status: 'interviewing' })
      .eq('id', state.candidateId)
      .in('status', ['new', 'screening']);

    const content = [
      `Role: ${state.job!.title}`,
      `Recommendation: ${review.recommendation} (confidence ${review.confidence})`,
      `Headline: ${review.headline}`,
      `Interview rating: ${evaluation.overall_rating} out of 10 (technical ${evaluation.technical_assessment.score}, communication ${evaluation.communication_assessment.score})`,
      `Strengths: ${evaluation.strengths.join('; ')}`,
      `Weaknesses: ${evaluation.weaknesses.join('; ')}`,
      `Red flag level: ${state.redFlags!.level} - ${state.redFlags!.overall_reason}`,
      `Reasoning: ${review.reasoning}`,
      `Open questions: ${review.open_questions.join('; ')}`,
    ].join('\n');

    const { data: entry } = await db
      .from('knowledge_entries')
      .insert({
        kind: 'interview_assessment',
        title: `${state.job!.title} - interview assessment`,
        content,
        job_id: state.jobId,
        candidate_id: state.candidateId,
        evaluation_id: state.evaluationId,
        metadata: {
          title: `${state.job!.title} - interview assessment`,
          job_title: state.job!.title,
          overall_rating: evaluation.overall_rating,
          recommendation: review.recommendation,
          flag_level: state.redFlags!.level,
        },
        created_by: state.userId,
      })
      .select('id')
      .single();

    // Index both the evaluation and the knowledge entry for future retrieval.
    await Promise.all([
      indexDocument({
        ownerType: 'evaluation',
        ownerId: state.evaluationId!,
        userId: state.userId,
        jobId: state.jobId,
        candidateId: state.candidateId,
        content,
        metadata: {
          title: `${state.job!.title} - interview assessment`,
          outcome: review.recommendation,
          overall_rating: evaluation.overall_rating,
        },
      }),
      entry
        ? indexDocument({
            ownerType: 'knowledge_entry',
            ownerId: entry.id as string,
            userId: state.userId,
            jobId: state.jobId,
            candidateId: state.candidateId,
            content,
            metadata: {
              title: `${state.job!.title} - interview assessment`,
              outcome: review.recommendation,
              kind: 'interview_assessment',
            },
          })
        : Promise.resolve(0),
    ]);

    return {};
  })

  .addEdge(START, 'load')
  .addEdge('load', 'retrieve_evidence')
  .addEdge('retrieve_evidence', 'evaluate_transcript')
  .addEdge('evaluate_transcript', 'persist_evaluation')
  .addEdge('persist_evaluation', 'detect_red_flags')
  .addEdge('detect_red_flags', 'persist_flags')
  .addEdge('persist_flags', 'synthesise_review')
  .addEdge('synthesise_review', 'persist_knowledge')
  .addEdge('persist_knowledge', END);

export const transcriptReviewGraph = graph.compile();

export interface TranscriptReviewResult {
  evaluationId: string | null;
  evaluation: TranscriptEvaluation | null;
  redFlags: RedFlagAnalysis | null;
  review: ReviewSynthesis | null;
  flagIds: string[];
  runId: string | null;
}

export async function runTranscriptReview(input: {
  userId: string;
  transcriptId: string;
}): Promise<TranscriptReviewResult> {
  const timer = new NodeTimer();
  const runId = await startRun({
    workflow: 'transcript_review',
    userId: input.userId,
    input: { transcript_id: input.transcriptId },
  });

  try {
    const result = await timer.track('transcript_review', () =>
      transcriptReviewGraph.invoke(
        { ...input, runId },
        { runName: 'Transcript Review', recursionLimit: 25 }
      )
    );

    await finishRun(runId, {
      status: 'complete',
      currentNode: 'persist_knowledge',
      nodeTimings: timer.results,
      output: {
        evaluation_id: result.evaluationId,
        overall_rating: result.evaluation?.overall_rating ?? null,
        flag_level: result.redFlags?.level ?? null,
        recommendation: result.review?.recommendation ?? null,
      },
    });

    return {
      evaluationId: result.evaluationId,
      evaluation: result.evaluation,
      redFlags: result.redFlags,
      review: result.review,
      flagIds: result.flagIds,
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
