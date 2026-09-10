import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { embeddingModel, embeddingModelName } from '@/lib/ai/models';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export type EmbeddingOwnerType =
  | 'job'
  | 'candidate'
  | 'question'
  | 'evaluation'
  | 'knowledge_entry'
  | 'recruiter_note';

export interface RetrievedChunk {
  id: string;
  owner_type: EmbeddingOwnerType;
  owner_id: string;
  job_id: string | null;
  candidate_id: string | null;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1200,
  chunkOverlap: 150,
});

export async function chunkText(text: string): Promise<string[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return splitter.splitText(trimmed);
}

/**
 * Embeds `content` and replaces any existing vectors for this owner.
 * Idempotent: safe to call again after a document is re-parsed.
 */
export async function indexDocument(params: {
  ownerType: EmbeddingOwnerType;
  ownerId: string;
  userId: string;
  content: string;
  jobId?: string | null;
  candidateId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  const chunks = await chunkText(params.content);
  const supabase = createSupabaseAdminClient();

  // Replace rather than append so re-indexing never leaves stale chunks behind.
  await supabase
    .from('embeddings')
    .delete()
    .eq('owner_type', params.ownerType)
    .eq('owner_id', params.ownerId);

  if (chunks.length === 0) return 0;

  const vectors = await embeddingModel().embedDocuments(chunks);
  const model = embeddingModelName();

  const rows = chunks.map((content, index) => ({
    owner_type: params.ownerType,
    owner_id: params.ownerId,
    job_id: params.jobId ?? null,
    candidate_id: params.candidateId ?? null,
    owner_user_id: params.userId,
    chunk_index: index,
    content,
    embedding: vectors[index],
    metadata: params.metadata ?? {},
    model,
  }));

  const { error } = await supabase.from('embeddings').insert(rows);
  if (error) throw new Error(`Failed to store embeddings: ${error.message}`);

  return rows.length;
}

export async function deleteDocumentVectors(ownerType: EmbeddingOwnerType, ownerId: string) {
  const supabase = createSupabaseAdminClient();
  await supabase.from('embeddings').delete().eq('owner_type', ownerType).eq('owner_id', ownerId);
}

/** Cosine-similarity search over the pgvector index. */
export async function retrieveSimilar(params: {
  query: string;
  userId?: string;
  ownerTypes?: EmbeddingOwnerType[];
  jobId?: string | null;
  excludeCandidateId?: string | null;
  limit?: number;
  minSimilarity?: number;
}): Promise<RetrievedChunk[]> {
  const query = params.query.trim();
  if (!query) return [];

  const [embedding] = await embeddingModel().embedDocuments([query.slice(0, 8000)]);
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase.rpc('match_embeddings', {
    query_embedding: embedding,
    p_owner_types: params.ownerTypes ?? null,
    p_user_id: params.userId ?? null,
    p_job_id: params.jobId ?? null,
    p_exclude_candidate_id: params.excludeCandidateId ?? null,
    match_count: params.limit ?? 8,
    min_similarity: params.minSimilarity ?? 0.15,
  });

  if (error) throw new Error(`Vector search failed: ${error.message}`);
  return (data ?? []) as RetrievedChunk[];
}
