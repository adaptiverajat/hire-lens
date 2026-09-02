-- HireLens :: 0005 :: generated interview question sets

-- A question set is one Question Agent run; questions hang off it so recruiters
-- can reuse a whole set or cherry-pick individual questions.
create table if not exists public.question_sets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,

  -- Null candidate_id means a job-level (reusable) set not tied to one resume.
  candidate_id uuid references public.candidates (id) on delete cascade,
  match_analysis_id uuid references public.match_analyses (id) on delete set null,

  label text not null,
  notes text,
  model text,
  run_id uuid,

  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_question_sets_job on public.question_sets (job_id, created_at desc);
create index if not exists idx_question_sets_candidate on public.question_sets (candidate_id);

create trigger question_sets_set_updated_at
  before update on public.question_sets
  for each row execute function public.set_updated_at();

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  question_set_id uuid references public.question_sets (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  candidate_id uuid references public.candidates (id) on delete cascade,

  category text not null
    check (category in ('screening', 'deep_technical', 'gap_validation', 'experience_validation')),

  question text not null,
  rationale text,

  -- Signals/keywords a strong answer should contain.
  expected_signals jsonb not null default '[]'::jsonb,

  -- The JD skill this question probes, when applicable.
  target_skill text,
  difficulty text
    check (difficulty is null or difficulty in ('easy', 'medium', 'hard')),

  source text not null default 'generated'
    check (source in ('generated', 'recruiter', 'library')),

  -- Recruiters can promote a good question into the reusable library.
  is_reusable boolean not null default true,
  times_used integer not null default 0,
  sort_order integer not null default 0,

  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_questions_set on public.questions (question_set_id, sort_order);
create index if not exists idx_questions_job on public.questions (job_id);
create index if not exists idx_questions_candidate on public.questions (candidate_id);
create index if not exists idx_questions_category on public.questions (category);
create index if not exists idx_questions_reusable on public.questions (is_reusable) where is_reusable;

create trigger questions_set_updated_at
  before update on public.questions
  for each row execute function public.set_updated_at();
