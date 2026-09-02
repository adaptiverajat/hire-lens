-- HireLens :: 0007 :: red flags and human review
-- Policy: the system never auto-rejects. Flags are advisory; a human decides.

create table if not exists public.flags (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  evaluation_id uuid references public.evaluations (id) on delete cascade,
  match_analysis_id uuid references public.match_analyses (id) on delete set null,

  level text not null check (level in ('GREEN', 'YELLOW', 'RED')),

  category text not null
    check (category in (
      'seniority_mismatch',      -- resume says junior, transcript shows expert (or reverse)
      'project_depth_mismatch',  -- claimed project depth not supported by answers
      'contradiction',           -- transcript contradicts the resume
      'unrealistic_claim',       -- implausible scope/tenure/impact
      'timeline_inconsistency',
      'other'
    )),

  reason text not null,

  -- Quoted resume/transcript spans backing the flag.
  evidence jsonb not null default '[]'::jsonb,
  confidence numeric(3, 2) check (confidence is null or confidence between 0 and 1),

  status text not null default 'open'
    check (status in ('open', 'in_review', 'resolved', 'dismissed')),

  model text,
  run_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_flags_candidate on public.flags (candidate_id);
create index if not exists idx_flags_status_level on public.flags (status, level);
create index if not exists idx_flags_job on public.flags (job_id);

create trigger flags_set_updated_at
  before update on public.flags
  for each row execute function public.set_updated_at();

-- Human Review Agent surface: every accept/override is recorded and fed back
-- into the learning repository.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  evaluation_id uuid references public.evaluations (id) on delete set null,
  flag_id uuid references public.flags (id) on delete set null,

  reviewer_id uuid not null references public.users (id) on delete cascade,

  decision text not null check (decision in ('accept', 'override')),

  -- What the agent said vs what the human concluded.
  agent_recommendation text,
  final_decision text not null
    check (final_decision in ('advance', 'hold', 'reject', 'hire')),

  notes text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_feedback_candidate on public.feedback (candidate_id, created_at desc);
create index if not exists idx_feedback_reviewer on public.feedback (reviewer_id);
create index if not exists idx_feedback_decision on public.feedback (decision);
