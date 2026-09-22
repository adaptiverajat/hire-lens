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
import {
  completeAgentTask,
  createAgentTask,
  failAgentTask,
  finishRun,
  NodeTimer,
  persistAgentArtifact,
  recordAgentEvent,
  startAgentTask,
  startRun,
} from '@/lib/graphs/run-log';
import { createArtifact } from '@/lib/orchestration/contracts';
import { readAgentMemory, type AgentMemoryNote } from '@/lib/orchestration/memory';
import { withReflexion } from '@/lib/orchestration/reflexion';
import {
  claimsFromTranscriptEvaluation,
  validateRedFlags,
  validateTranscriptEvaluation,
} from '@/lib/orchestration/validation';

/**
 * Transcript Review workflow (Features 5 + 6 + 7).
 *
 *   load -> retrieve_evidence -> evaluate_transcript -> persist_evaluation
 *        -> retrieve_flag_evidence -> detect_red_flags -> persist_flags
 *        -> synthesise_review -> persist_knowledge
 *
 * Nothing here rejects a candidate. The output is a recommendation plus flags,
 * queued for a human to accept or override.
 */

const State = Annotation.Root({
  userId: Annotation<string>(),
  transcriptId: Annotation<string>(),
  runId: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  evaluationTaskId: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  redFlagTaskId: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),

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
  flagEvidence: Annotation<EvidenceItem[]>({ reducer: (_, b) => b, default: () => [] }),
  evaluationCalibration: Annotation<AgentMemoryNote[]>({ reducer: (_, b) => b, default: () => [] }),
  redFlagCalibration: Annotation<AgentMemoryNote[]>({ reducer: (_, b) => b, default: () => [] }),
  reviewCalibration: Annotation<AgentMemoryNote[]>({ reducer: (_, b) => b, default: () => [] }),
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

    // Fetch calibration notes from shared agent memory for each agent that
    // will run in this workflow. Notes are scoped to the job when possible.
    const [evaluationCalibration, redFlagCalibration, reviewCalibration] = await Promise.all([
      readAgentMemory({ agentName: 'Transcript Evaluation Agent', jobId: interview.job_id }),
      readAgentMemory({ agentName: 'Red Flag Agent', jobId: interview.job_id }),
      readAgentMemory({ agentName: 'Human Review Agent', jobId: interview.job_id }),
    ]);

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
      evaluationCalibration,
      redFlagCalibration,
      reviewCalibration,
    };
  })

  .addNode('retrieve_evidence', async (state) => {
    const evidence = await runEvidenceAgent({
      purpose: 'interview_evaluation',
      query: [
        `Role: ${state.job!.title}`,
        `Interview assessment for a candidate with skills: ${state.requirements.join(', ')}`,
        `Candidate profile: ${state.candidate!.headline ?? ''}`,
        state.matchSummary?.summary ?? '',
      ].join('\n'),
      userId: state.userId,
      jobId: state.jobId,
      excludeCandidateId: state.candidateId,
      ownerTypes: ['knowledge_entry', 'evaluation'],
      limit: 4,
      pii: {
        names: [state.candidate!.full_name, ...state.participants],
        institutions: state.candidate!.structured?.education.map((item) => item.institution),
      },
    });

    return { evidence };
  })

  .addNode('retrieve_flag_evidence', async (state) => {
    const flagEvidence = await runEvidenceAgent({
      purpose: 'red_flag_grounding',
      query: [
        `Role: ${state.job!.title}`,
        `Seniority expected: ${state.job!.seniority ?? 'not specified'}`,
        `Requirements: ${state.requirements.join(', ')}`,
        `Resume claims: ${resumeProfileText(state.candidate!.structured)}`,
        `Transcript evidence: ${state.transcriptText.slice(0, 12000)}`,
        `Known gaps: ${state.matchSummary?.missing_skills.map((item) => item.skill).join(', ') || 'none'}`,
      ].join('\n'),
      userId: state.userId,
      jobId: state.jobId,
      excludeCandidateId: state.candidateId,
      ownerTypes: ['knowledge_entry', 'evaluation'],
      limit: 6,
      minSimilarity: 0.12,
      pii: {
        names: [state.candidate!.full_name, ...state.participants],
        institutions: state.candidate!.structured?.education.map((item) => item.institution),
      },
    });

    return { flagEvidence };
  })

  .addNode('evaluate_transcript', async (state) => {
    if (state.evaluationTaskId) await startAgentTask(state.evaluationTaskId);
    if (state.runId) {
      await recordAgentEvent({
        runId: state.runId,
        taskId: state.evaluationTaskId,
        eventType: 'agent_started',
        payload: { agent: 'Transcript Evaluation Agent' },
      });
    }

    const evaluation = await withReflexion({
      agentName: 'Transcript Evaluation Agent',
      maxAttempts: 2,
      jobId: state.jobId,
      candidateId: state.candidateId,
      runId: state.runId,
      run: (_attempt, feedback) =>
        runTranscriptAgent({
          jobTitle: state.job!.title,
          jobSummary: jobSummary(state.job!),
          requirements: state.requirements,
          candidateName: state.candidate!.full_name,
          candidateSummary: state.candidate!.structured?.summary ?? 'not available',
          questions: state.plannedQuestions,
          transcript: state.transcriptText,
          participants: state.participants,
          candidateInstitutions: state.candidate!.structured?.education.map((item) => item.institution),
          evidence: state.evidence,
          calibrationNotes: state.evaluationCalibration,
          feedback: feedback.length > 0 ? feedback.join(' ') : undefined,
        }),
      validate: (output) => validateTranscriptEvaluation(output, state.transcriptText),
    });

    const issues = validateTranscriptEvaluation(evaluation, state.transcriptText);

    if (state.runId) {
      const artifact = createArtifact({
        runId: state.runId,
        taskId: state.evaluationTaskId ?? undefined,
        artifactType: 'transcript_evaluation',
        schemaVersion: '1.0',
        producer: 'Transcript Evaluation Agent',
        consumer: 'Human Review Agent',
        payload: evaluation,
        evidence: claimsFromTranscriptEvaluation(evaluation, state.transcriptId),
        warnings: issues.map((issue) => issue.message),
        confidence: 1,
      });
      artifact.status = 'validated';
      const artifactId = await persistAgentArtifact(artifact);
      await completeAgentTask(state.evaluationTaskId ?? '', artifactId);
      await recordAgentEvent({
        runId: state.runId,
        taskId: state.evaluationTaskId,
        eventType: 'agent_completed',
        payload: { agent: 'Transcript Evaluation Agent', artifactId },
      });
    }

    return { evaluation };
  })

  .addNode('persist_evaluation', async (state) => {
    const evaluation = state.evaluation!;
    const db = createSupabaseAdminClient();

    if (state.runId) {
      const { data: existing } = await db
        .from('evaluations')
        .select('id')
        .eq('transcript_id', state.transcriptId)
        .eq('run_id', state.runId)
        .maybeSingle();
      if (existing?.id) return { evaluationId: existing.id as string };
    }

    const { data, error } = await db
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
    if (state.redFlagTaskId) await startAgentTask(state.redFlagTaskId);
    const redFlagValidationContext = {
      resume: resumeProfileText(state.candidate!.structured),
      transcript: state.transcriptText,
      job: `${jobSummary(state.job!)}\n${state.requirements.join(', ')}`,
      retrievedEvidence: state.flagEvidence,
    };
    if (state.runId) {
      await recordAgentEvent({
        runId: state.runId,
        taskId: state.redFlagTaskId,
        eventType: 'agent_started',
        payload: { agent: 'Red Flag Agent' },
      });
    }

    const redFlags = await withReflexion({
      agentName: 'Red Flag Agent',
      maxAttempts: 2,
      jobId: state.jobId,
      candidateId: state.candidateId,
      runId: state.runId,
      run: (_attempt, feedback) =>
        runRedFlagAgent({
          jobTitle: state.job!.title,
          seniority: state.job!.seniority,
          requirements: state.requirements,
          candidateName: state.candidate!.full_name,
          candidateYears: state.candidate!.total_years_experience,
          candidateHeadline: state.candidate!.headline,
          resumeProfile: resumeProfileText(state.candidate!.structured),
          transcript: state.transcriptText,
          evidence: state.flagEvidence,
          candidateInstitutions: state.candidate!.structured?.education.map((item) => item.institution),
          calibrationNotes: state.redFlagCalibration,
          feedback: feedback.length > 0 ? feedback.join(' ') : undefined,
        }),
      validate: (output) => validateRedFlags(output, redFlagValidationContext),
    });

    const issues = validateRedFlags(redFlags, redFlagValidationContext);

    if (state.runId) {
      const artifact = createArtifact({
        runId: state.runId,
        taskId: state.redFlagTaskId ?? undefined,
        artifactType: 'red_flag_analysis',
        schemaVersion: '1.0',
        producer: 'Red Flag Agent',
        consumer: 'Human Review Agent',
        payload: redFlags,
        evidence: redFlags.flags.flatMap((flag) => [
          ...flag.evidence.map((evidence) => ({
            sourceType: evidence.source,
            sourceId: state.candidateId,
            quote: evidence.quote,
            claim: flag.reason,
            confidence: flag.confidence,
          })),
          ...flag.retrieved_cases.map((retrievedCase) => ({
            sourceType: 'knowledge' as const,
            sourceId: retrievedCase.owner_id,
            quote: retrievedCase.title,
            claim: retrievedCase.relevance,
            confidence: flag.confidence,
          })),
        ]),
        warnings: issues.map((issue) => issue.message),
        confidence: redFlags.flags.length
          ? Math.min(...redFlags.flags.map((flag) => flag.confidence))
          : 1,
      });
      artifact.status = 'validated';
      const artifactId = await persistAgentArtifact(artifact);
      await completeAgentTask(state.redFlagTaskId ?? '', artifactId);
      await recordAgentEvent({
        runId: state.runId,
        taskId: state.redFlagTaskId,
        eventType: 'agent_completed',
        payload: { agent: 'Red Flag Agent', artifactId },
      });
    }

    return { redFlags };
  })

  .addNode('persist_flags', async (state) => {
    const redFlags = state.redFlags!;
    const db = createSupabaseAdminClient();

    if (state.runId) {
      const { data: existing } = await db
        .from('flags')
        .select('id')
        .eq('run_id', state.runId);
      if (existing && existing.length > 0) {
        return { flagIds: existing.map((row: { id: string }) => row.id) };
      }
    }

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
            evidence: [
              ...f.evidence,
              ...f.retrieved_cases.map((retrievedCase) => ({
                source: 'retrieved_case',
                quote: `${retrievedCase.title} [${retrievedCase.owner_id}]: ${retrievedCase.relevance}`,
              })),
            ],
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
    const evaluation = state.evaluation!;
    const redFlags = state.redFlags!;

    // Optimization: when there are no red flags (GREEN), skip the LLM call and
    // construct a default review packet from the evaluation + match analysis.
    // The Human Review Agent adds the most value when there are flags to weigh.
    if (redFlags.level === 'GREEN' && redFlags.flags.length === 0) {
      const matchScore = state.matchSummary?.match_score ?? null;
      const verdict = state.matchSummary?.verdict ?? null;
      const recommendation =
        evaluation.overall_rating >= 7 && (matchScore ?? 0) >= 60
          ? 'advance'
          : evaluation.overall_rating < 4 || (matchScore ?? 0) < 40
            ? 'reject'
            : 'hold';

      const review: ReviewSynthesis = {
        recommendation: recommendation as ReviewSynthesis['recommendation'],
        confidence: 0.7,
        headline: `${evaluation.overall_rating}/10 interview · ${matchScore ?? '—'}/100 match · no red flags`,
        reasoning: `No inconsistencies detected between resume and interview. Interview rating ${evaluation.overall_rating}/10 (technical ${evaluation.technical_assessment.score}, communication ${evaluation.communication_assessment.score}). ${evaluation.rationale}`,
        key_evidence: [
          `Technical score: ${evaluation.technical_assessment.score}/10`,
          `Communication score: ${evaluation.communication_assessment.score}/10`,
          ...(evaluation.strengths.slice(0, 3).map((s) => `Strength: ${s}`)),
        ],
        open_questions: evaluation.weaknesses.slice(0, 3).map((w) => `Verify: ${w}`),
        comparable_cases: [],
      };

      return { review };
    }

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
      calibrationNotes: state.reviewCalibration,
    });

    return { review };
  })

  .addNode('persist_knowledge', async (state) => {
    const db = createSupabaseAdminClient();
    const evaluation = state.evaluation!;
    const review = state.review!;

    const { data: existingKnowledge } = await db
      .from('knowledge_entries')
      .select('id')
      .eq('evaluation_id', state.evaluationId)
      .eq('kind', 'interview_assessment')
      .maybeSingle();
    if (existingKnowledge?.id) return {};

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
  .addEdge('retrieve_evidence', 'retrieve_flag_evidence')
  .addEdge('retrieve_flag_evidence', 'detect_red_flags')
  .addEdge('evaluate_transcript', 'persist_evaluation')
  .addEdge(['persist_evaluation', 'detect_red_flags'], 'persist_flags')
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
  candidateId?: string;
}): Promise<TranscriptReviewResult> {
  const timer = new NodeTimer();
  const runId = await startRun({
    workflow: 'transcript_review',
    userId: input.userId,
    candidateId: input.candidateId ?? null,
    input: { transcript_id: input.transcriptId },
  });

  const [evaluationTaskId, redFlagTaskId] = runId
    ? await Promise.all([
        createAgentTask({
          runId,
          agentName: 'Transcript Evaluation Agent',
          taskType: 'transcript_evaluation',
          idempotencyKey: `${runId}:transcript_evaluation`,
        }),
        createAgentTask({
          runId,
          agentName: 'Red Flag Agent',
          taskType: 'red_flag_analysis',
          idempotencyKey: `${runId}:red_flag_analysis`,
        }),
      ])
    : [null, null];

  try {
    const result = await timer.track('transcript_review', () =>
      transcriptReviewGraph.invoke(
        { ...input, runId, evaluationTaskId, redFlagTaskId },
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
