-- HireLens :: 0009 :: LangGraph run log (observability, pairs with LangSmith traces)

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),

  workflow text not null
    check (workflow in (
      'jd_intake',
      'resume_intake',
      'candidate_analysis',
      'transcript_review'
    )),

  -- Which node the graph reached; useful when a run fails mid-graph.
  current_node text,
  status text not null default 'running'
    check (status in ('running', 'complete', 'failed')),

  job_id uuid references public.jobs (id) on delete cascade,
  candidate_id uuid references public.candidates (id) on delete cascade,

  input jsonb not null default '{}'::jsonb,
  output jsonb,
  node_timings jsonb not null default '[]'::jsonb,
  error text,

  -- LangSmith correlation.
  trace_id text,
  total_tokens integer,

  created_by uuid references public.users (id) on delete set null,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz
);

create index if not exists idx_agent_runs_workflow on public.agent_runs (workflow, started_at desc);
create index if not exists idx_agent_runs_candidate on public.agent_runs (candidate_id);
create index if not exists idx_agent_runs_job on public.agent_runs (job_id);
create index if not exists idx_agent_runs_status on public.agent_runs (status);
