-- HireLens :: 0016 :: shared agent memory
-- Persistent, cross-run calibration notes that agents read from and write to.
-- Unlike the vector store (which stores historical cases for RAG), agent_memory
-- stores agent-scoped learnings: calibration feedback, bias warnings, and
-- outcome notes that adjust agent behavior on future runs.

-- Drop first in case a partial/failed run left a malformed table.
drop table if exists public.agent_memory cascade;

create table public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  note_type text not null
    check (note_type in ('calibration', 'bias_warning', 'outcome', 'insight')),
  content text not null,
  confidence numeric(4, 3) not null default 1
    check (confidence >= 0 and confidence <= 1),
  source text not null
    check (source in ('reviewer_override', 'validation_failure', 'post_hire_outcome', 'agent_insight', 'cross_agent')),
  job_id uuid references public.jobs (id) on delete set null,
  candidate_id uuid references public.candidates (id) on delete set null,
  run_id uuid references public.agent_runs (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz
);

create index if not exists idx_agent_memory_agent on public.agent_memory (agent_name, created_at desc);
create index if not exists idx_agent_memory_type on public.agent_memory (note_type, created_at desc);
create index if not exists idx_agent_memory_job on public.agent_memory (job_id) where job_id is not null;

alter table public.agent_memory enable row level security;

create policy agent_memory_authenticated on public.agent_memory
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
