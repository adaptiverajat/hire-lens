import { retrieveSimilar, type EmbeddingOwnerType, type RetrievedChunk } from '@/lib/ai/vector-store';

export interface EvidenceItem {
  source: EmbeddingOwnerType;
  ownerId: string;
  similarity: number;
  content: string;
  title: string;
  outcome: string | null;
}

/**
 * Evidence Retrieval Agent.
 *
 * Pulls similar historical cases out of pgvector so downstream agents ground
 * their recommendations in what actually happened before, rather than reasoning
 * from the current candidate alone. Called before every recommendation.
 */
export async function runEvidenceAgent(input: {
  query: string;
  userId: string;
  jobId?: string | null;
  /** Keeps the candidate being analysed out of their own evidence set. */
  excludeCandidateId?: string | null;
  ownerTypes?: EmbeddingOwnerType[];
  limit?: number;
}): Promise<EvidenceItem[]> {
  let chunks: RetrievedChunk[] = [];

  try {
    chunks = await retrieveSimilar({
      query: input.query,
      userId: input.userId,
      ownerTypes: input.ownerTypes ?? ['knowledge_entry', 'evaluation'],
      excludeCandidateId: input.excludeCandidateId ?? null,
      limit: input.limit ?? 6,
      minSimilarity: 0.2,
    });
  } catch (error) {
    // Retrieval is an enhancement, never a hard dependency: a cold vector store
    // or a transient embedding failure must not block an analysis.
    console.error('[evidence-agent] retrieval failed, continuing without evidence', error);
    return [];
  }

  return chunks.map((chunk) => ({
    source: chunk.owner_type,
    ownerId: chunk.owner_id,
    similarity: Math.round(chunk.similarity * 1000) / 1000,
    content: chunk.content,
    title: typeof chunk.metadata?.title === 'string' ? chunk.metadata.title : 'Historical case',
    outcome: typeof chunk.metadata?.outcome === 'string' ? chunk.metadata.outcome : null,
  }));
}

/** Renders retrieved evidence for injection into a prompt as a template value. */
export function formatEvidence(items: EvidenceItem[]): string {
  if (items.length === 0) {
    return 'No comparable historical cases were found. Reason from the supplied documents only and do not speculate about precedent.';
  }

  return items
    .map((item, index) => {
      const outcome = item.outcome ? ` | recorded outcome: ${item.outcome}` : '';
      const body = item.content.slice(0, 1200);
      return `Case ${index + 1} (similarity ${item.similarity}${outcome})\nTitle: ${item.title}\n${body}`;
    })
    .join('\n\n');
}
