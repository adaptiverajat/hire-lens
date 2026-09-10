import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, parseBody, requireOwnedCandidate, withAuth } from '@/lib/api/handler';
import { indexDocument } from '@/lib/ai/vector-store';
import { writeAgentMemory } from '@/lib/orchestration/memory';

export const runtime = 'nodejs';
export const maxDuration = 120;

const reviewSchema = z.object({
  candidate_id: z.string().uuid(),
  evaluation_id: z.string().uuid().nullish(),
  flag_id: z.string().uuid().nullish(),
  decision: z.enum(['accept', 'override']),
  agent_recommendation: z.string().max(60).nullish(),
  final_decision: z.enum(['advance', 'hold', 'reject', 'hire']),
  notes: z.string().min(10, 'Please record why you reached this decision'),
  resolve_flags: z.boolean().default(true),
});

// A human decision maps onto the candidate pipeline status.
const STATUS_BY_DECISION = {
  advance: 'interviewing',
  hold: 'on_hold',
  reject: 'rejected',
  hire: 'hired',
} as const;

/**
 * POST /api/review - record a human accept/override.
 *
 * This is the only path that can reject a candidate: agents recommend, humans
 * decide. Every decision is written into the learning repository and embedded so
 * future analyses retrieve it as precedent.
 */
export const POST = withAuth(async (ctx, request: Request) => {
  const body = await parseBody(request, reviewSchema);
  const candidate = await requireOwnedCandidate(
    ctx,
    body.candidate_id,
    'id, job_id, full_name, status'
  );

  const jobId = String(candidate.job_id);

  const { data: feedback, error } = await ctx.db
    .from('feedback')
    .insert({
      job_id: jobId,
      candidate_id: body.candidate_id,
      evaluation_id: body.evaluation_id ?? null,
      flag_id: body.flag_id ?? null,
      reviewer_id: ctx.userId,
      decision: body.decision,
      agent_recommendation: body.agent_recommendation ?? null,
      final_decision: body.final_decision,
      notes: body.notes,
    })
    .select('*')
    .single();

  if (error) throw new ApiError(500, error.message);

  await ctx.db
    .from('candidates')
    .update({ status: STATUS_BY_DECISION[body.final_decision] })
    .eq('id', body.candidate_id);

  // Close out the flags this decision resolves.
  if (body.resolve_flags) {
    const flagQuery = ctx.db.from('flags').update({ status: 'resolved' });
    if (body.flag_id) {
      await flagQuery.eq('id', body.flag_id);
    } else {
      await flagQuery.eq('candidate_id', body.candidate_id).eq('status', 'open');
    }
  }

  const { data: job } = await ctx.db.from('jobs').select('title').eq('id', jobId).single();

  // --- Learning repository ---------------------------------------------------
  const kind =
    body.decision === 'override'
      ? 'override'
      : body.final_decision === 'reject'
        ? 'rejected_candidate'
        : body.final_decision === 'hire' || body.final_decision === 'advance'
          ? 'approved_candidate'
          : 'historical_case';

  const title = `${job?.title ?? 'Role'} - ${body.final_decision}${
    body.decision === 'override' ? ' (recruiter override)' : ''
  }`;

  const content = [
    `Role: ${job?.title ?? 'unknown'}`,
    `Reviewer decision: ${body.final_decision} (${body.decision})`,
    body.agent_recommendation ? `Agent had recommended: ${body.agent_recommendation}` : null,
    `Reviewer reasoning: ${body.notes}`,
  ]
    .filter(Boolean)
    .join('\n');

  const { data: entry } = await ctx.db
    .from('knowledge_entries')
    .insert({
      kind,
      title,
      content,
      job_id: jobId,
      candidate_id: body.candidate_id,
      evaluation_id: body.evaluation_id ?? null,
      feedback_id: feedback.id,
      outcome: body.final_decision,
      metadata: {
        title,
        outcome: body.final_decision,
        decision_type: body.decision,
        job_title: job?.title ?? null,
      },
      created_by: ctx.userId,
    })
    .select('id')
    .single();

  if (entry) {
    await indexDocument({
      ownerType: 'knowledge_entry',
      ownerId: entry.id as string,
      userId: ctx.userId,
      jobId,
      candidateId: body.candidate_id,
      content,
      metadata: { title, outcome: body.final_decision, kind },
    });
  }

  // --- Shared Agent Memory write-back -------------------------------------
  // When a human overrides an agent recommendation, write a calibration note
  // so the agent can learn from the correction on future runs.
  if (body.decision === 'override' && body.agent_recommendation) {
    const agentName =
      body.flag_id
        ? 'Red Flag Agent'
        : body.evaluation_id
          ? 'Human Review Agent'
          : 'Transcript Evaluation Agent';

    await writeAgentMemory({
      agentName,
      noteType: 'calibration',
      source: 'reviewer_override',
      content: `Reviewer overrode agent recommendation "${body.agent_recommendation}" with "${body.final_decision}". Reason: ${body.notes}`,
      confidence: 0.9,
      jobId,
      candidateId: body.candidate_id,
      metadata: {
        agent_recommendation: body.agent_recommendation,
        final_decision: body.final_decision,
        reviewer_notes: body.notes,
      },
    });
  }

  return NextResponse.json(
    { ...feedback, knowledge_entry_id: entry?.id ?? null },
    { status: 201 }
  );
});
