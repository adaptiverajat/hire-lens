import { z } from 'zod';
import { generateStructured } from '@/lib/ai/structured';
import { retrieveSimilar, type EmbeddingOwnerType, type RetrievedChunk } from '@/lib/ai/vector-store';
import type { PiiContext } from '@/lib/ai/pii';

const retrievalPlanSchema = z.object({
  intent: z.enum([
    'candidate_fit',
    'gap_validation',
    'interview_evaluation',
    'red_flag_grounding',
    'review_precedent',
  ]),
  rationale: z.string(),
  queries: z.array(z.string().min(10)).min(2).max(4),
  required_evidence: z.array(z.string()).max(6),
});

export type RetrievalIntent = z.infer<typeof retrievalPlanSchema>['intent'];

export interface EvidenceItem {
  source: EmbeddingOwnerType;
  ownerId: string;
  similarity: number;
  content: string;
  title: string;
  outcome: string | null;
  retrievalIntent: RetrievalIntent;
  retrievalQuery: string;
}

/**
 * Evidence Retrieval Agent.
 *
 * Resolves retrieval intent, creates multiple semantic queries, retrieves
 * historical cases, and returns deduplicated context for downstream reasoning.
 */
export async function runEvidenceAgent(input: {
  query: string;
  purpose: RetrievalIntent;
  userId?: string;
  jobId?: string | null;
  /** Keeps the candidate being analysed out of their own evidence set. */
  excludeCandidateId?: string | null;
  ownerTypes?: EmbeddingOwnerType[];
  limit?: number;
  minSimilarity?: number;
  pii?: PiiContext;
}): Promise<EvidenceItem[]> {
  const fallbackPlan = {
    intent: input.purpose,
    rationale: 'Use the supplied workflow context directly.',
    queries: [input.query, `${input.purpose.replaceAll('_', ' ')} historical recruitment outcomes\n${input.query}`],
    required_evidence: [],
  };
  let plan: z.infer<typeof retrievalPlanSchema> = fallbackPlan;

  try {
    plan = await generateStructured({
      schema: retrievalPlanSchema,
      schemaName: 'retrieval_plan',
      runName: 'Evidence Retrieval Agent',
      system: `You are an evidence-retrieval planning agent for recruitment decisions.
Do not answer the hiring question. Resolve the retrieval intent and produce 2-4 distinct,
privacy-safe semantic search queries for comparable historical cases. Diversify queries
across role requirements, demonstrated evidence, uncertainty, and verified outcomes.
For red-flag grounding, target precedents for the specific contradiction types suggested
by the supplied resume and transcript context. Never invent facts not present in context.`,
      user: `Required intent: {purpose}

Workflow context:
{query}

Return a retrieval plan only.`,
      tier: 'fast',
      temperature: 0.1,
      maxTokens: 900,
      input: { purpose: input.purpose, query: input.query.slice(0, 12000) },
      pii: input.pii,
    });
  } catch (error) {
    console.error('[evidence-agent] intent planning failed, using fallback queries', error);
  }

  try {
    const results = await Promise.all(
      [...new Set(plan.queries.map((query) => query.trim()).filter(Boolean))].map(async (query) => ({
        query,
        chunks: await retrieveSimilar({
          query,
          ownerTypes: input.ownerTypes ?? ['knowledge_entry', 'evaluation'],
          excludeCandidateId: input.excludeCandidateId ?? null,
          limit: input.limit ?? 4,
          minSimilarity: input.minSimilarity ?? 0.2,
          pii: input.pii,
        }),
      })),
    );
    const byOwner = new Map<string, { chunk: RetrievedChunk; query: string }>();
    for (const result of results) {
      for (const chunk of result.chunks) {
        const existing = byOwner.get(chunk.owner_id);
        if (!existing || chunk.similarity > existing.chunk.similarity) {
          byOwner.set(chunk.owner_id, { chunk, query: result.query });
        }
      }
    }

    return [...byOwner.values()]
      .sort((a, b) => b.chunk.similarity - a.chunk.similarity)
      .slice(0, input.limit ?? 4)
      .map(({ chunk, query }) => ({
        source: chunk.owner_type,
        ownerId: chunk.owner_id,
        similarity: Math.round(chunk.similarity * 1000) / 1000,
        content: chunk.content,
        title: typeof chunk.metadata?.title === 'string' ? chunk.metadata.title : 'Historical case',
        outcome: typeof chunk.metadata?.outcome === 'string' ? chunk.metadata.outcome : null,
        retrievalIntent: plan.intent,
        retrievalQuery: query,
      }));
  } catch (error) {
    // Retrieval is an enhancement, never a hard dependency: a cold vector store
    // or a transient embedding failure must not block an analysis.
    console.error('[evidence-agent] retrieval failed, continuing without evidence', error);
    return [];
  }
}

/** Renders retrieved evidence for injection into a prompt as a template value. */
export function formatEvidence(items: EvidenceItem[]): string {
  if (items.length === 0) {
    return 'No comparable historical cases were found. Reason from the supplied documents only and do not speculate about precedent.';
  }

  return items
    .map((item, index) => {
      const outcome = item.outcome ? ` | recorded outcome: ${item.outcome}` : '';
      const body = item.content.slice(0, 800);
      return `Case ${index + 1} [ID: ${item.ownerId}] (intent: ${item.retrievalIntent}, similarity ${item.similarity}${outcome})\nTitle: ${item.title}\n${body}`;
    })
    .join('\n\n');
}
