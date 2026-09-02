-- HireLens :: 0008 :: learning repository + pgvector retrieval layer

-- Organisational memory: approvals, rejections, overrides, assessments, notes.
create table if not exists public.knowledge_entries (
  id uuid primary key default gen_random_uuid(),

  kind text not null
    check (kind in (
      'approved_candidate',
      'rejected_candidate',
      'override',
      'interview_assessment',
      'historical_case',
      'recruiter_note'
    )),

  title text not null,
  content text not null,

  job_id uuid references public.jobs (id) on delete set null,
  candidate_id uuid references public.candidates (id) on delete set null,
  evaluation_id uuid references public.evaluations (id) on delete set null,
  feedback_id uuid references public.feedback (id) on delete set null,

  -- Denormalised facets for cheap filtering alongside vector search.
  metadata jsonb not null default '{}'::jsonb,
  outcome text
    check (outcome is null or outcome in ('advance', 'hold', 'reject', 'hire')),

  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_knowledge_kind on public.knowledge_entries (kind);
create index if not exists idx_knowledge_job on public.knowledge_entries (job_id);
create index if not exists idx_knowledge_candidate on public.knowledge_entries (candidate_id);
create index if not exists idx_knowledge_created_at on public.knowledge_entries (created_at desc);

create trigger knowledge_entries_set_updated_at
  before update on public.knowledge_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Vector store
-- ---------------------------------------------------------------------------
-- One row per chunk. `owner_type`/`owner_id` is a soft polymorphic pointer so a
-- single index serves JDs, resumes, questions, evaluations, cases and notes.
-- Dimension 1536 matches text-embedding-3-small.

create table if not exists public.embeddings (
  id uuid primary key default gen_random_uuid(),

  owner_type text not null
    check (owner_type in (
      'job',
      'candidate',
      'question',
      'evaluation',
      'knowledge_entry',
      'recruiter_note'
    )),
  owner_id uuid not null,

  -- Denormalised so retrieval can filter without joining back to each table.
  job_id uuid references public.jobs (id) on delete cascade,
  candidate_id uuid references public.candidates (id) on delete cascade,
  owner_user_id uuid references public.users (id) on delete cascade,

  chunk_index integer not null default 0,
  content text not null,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,

  model text not null default 'text-embedding-3-small',
  created_at timestamptz not null default timezone('utc', now()),

  unique (owner_type, owner_id, chunk_index)
);

create index if not exists idx_embeddings_owner on public.embeddings (owner_type, owner_id);
create index if not exists idx_embeddings_job on public.embeddings (job_id);
create index if not exists idx_embeddings_candidate on public.embeddings (candidate_id);
create index if not exists idx_embeddings_user on public.embeddings (owner_user_id);

-- HNSW gives good recall/latency without needing a trained list count.
create index if not exists idx_embeddings_vector
  on public.embeddings
  using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Retrieval function
-- ---------------------------------------------------------------------------
-- Cosine similarity search with optional owner-type / tenancy / job filters.
create or replace function public.match_embeddings(
  query_embedding vector(1536),
  p_owner_types text[] default null,
  p_user_id uuid default null,
  p_job_id uuid default null,
  p_exclude_candidate_id uuid default null,
  match_count integer default 8,
  min_similarity double precision default 0.0
)
returns table (
  id uuid,
  owner_type text,
  owner_id uuid,
  job_id uuid,
  candidate_id uuid,
  chunk_index integer,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
as $$
  select
    e.id,
    e.owner_type,
    e.owner_id,
    e.job_id,
    e.candidate_id,
    e.chunk_index,
    e.content,
    e.metadata,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.embeddings e
  where (p_owner_types is null or e.owner_type = any (p_owner_types))
    and (p_user_id is null or e.owner_user_id = p_user_id)
    and (p_job_id is null or e.job_id = p_job_id)
    and (p_exclude_candidate_id is null or e.candidate_id is distinct from p_exclude_candidate_id)
    and 1 - (e.embedding <=> query_embedding) >= min_similarity
  order by e.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
