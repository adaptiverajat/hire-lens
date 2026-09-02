-- HireLens :: 0001 :: extensions and shared helpers
-- Run these migrations in order against your Supabase project.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- pgvector powers the RAG / evidence-retrieval layer.
create extension if not exists "vector";

-- Shared updated_at trigger used by every mutable table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;
