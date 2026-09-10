-- HireLens :: 0015 :: durable multi-agent orchestration
-- Stores task lifecycle and typed artifacts independently from final domain rows.

create table if not exists public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs (id) on delete cascade,
  agent_name text not null,
  task_type text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'complete', 'failed', 'blocked')),
  dependency_ids jsonb not null default '[]'::jsonb,
  input_artifact_ids jsonb not null default '[]'::jsonb,
  output_artifact_id uuid,
  idempotency_key text not null unique,
  attempt integer not null default 0 check (attempt >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  leased_until timestamptz,
  error text,
  created_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists idx_agent_tasks_run on public.agent_tasks (run_id, created_at);
create index if not exists idx_agent_tasks_status on public.agent_tasks (status, leased_until);
create index if not exists idx_agent_tasks_agent on public.agent_tasks (agent_name, created_at desc);

create table if not exists public.agent_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs (id) on delete cascade,
  task_id uuid references public.agent_tasks (id) on delete set null,
  artifact_type text not null,
  schema_version text not null,
  producer text not null,
  consumer text,
  status text not null default 'produced'
    check (status in ('produced', 'validated', 'rejected')),
  payload jsonb not null,
  evidence jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  confidence numeric(4, 3) not null default 1
    check (confidence >= 0 and confidence <= 1),
  content_hash text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.agent_tasks
  add constraint agent_tasks_output_artifact_fk
  foreign key (output_artifact_id) references public.agent_artifacts (id) on delete set null;

create index if not exists idx_agent_artifacts_run on public.agent_artifacts (run_id, created_at);
create index if not exists idx_agent_artifacts_type on public.agent_artifacts (artifact_type, created_at desc);
create index if not exists idx_agent_artifacts_task on public.agent_artifacts (task_id);

create table if not exists public.agent_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs (id) on delete cascade,
  task_id uuid references public.agent_tasks (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_agent_events_run on public.agent_events (run_id, created_at);
create index if not exists idx_agent_events_task on public.agent_events (task_id, created_at);

alter table public.agent_tasks enable row level security;
alter table public.agent_artifacts enable row level security;
alter table public.agent_events enable row level security;

create policy agent_tasks_authenticated on public.agent_tasks
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy agent_artifacts_authenticated on public.agent_artifacts
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy agent_events_authenticated on public.agent_events
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
