-- HireLens :: 0006 :: interviews, transcripts and transcript evaluations

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  question_set_id uuid references public.question_sets (id) on delete set null,

  round integer not null default 1,
  stage text not null default 'technical'
    check (stage in ('screening', 'technical', 'system_design', 'behavioural', 'final')),

  interviewer_id uuid references public.users (id) on delete set null,
  interviewer_name text,
  scheduled_at timestamptz,
  duration_minutes integer,

  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),

  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_interviews_candidate on public.interviews (candidate_id, round);
create index if not exists idx_interviews_job on public.interviews (job_id);

create trigger interviews_set_updated_at
  before update on public.interviews
  for each row execute function public.set_updated_at();

create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews (id) on delete cascade,

  source text not null default 'manual'
    check (source in ('teams', 'zoom', 'meet', 'manual', 'upload')),

  raw_text text not null,
  source_file_path text,
  source_file_name text,

  -- Speaker turns parsed out of the Teams/VTT export.
  turns jsonb not null default '[]'::jsonb,
  participants jsonb not null default '[]'::jsonb,
  word_count integer,

  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_transcripts_interview on public.transcripts (interview_id);

-- Transcript Evaluation Agent output.
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references public.transcripts (id) on delete cascade,
  interview_id uuid not null references public.interviews (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,

  -- { score, depth, accuracy, notes, evidence[] }
  technical_assessment jsonb not null default '{}'::jsonb,
  -- { score, clarity, structure, notes, evidence[] }
  communication_assessment jsonb not null default '{}'::jsonb,

  overall_rating numeric(3, 1) not null check (overall_rating between 0 and 10),

  strengths jsonb not null default '[]'::jsonb,
  weaknesses jsonb not null default '[]'::jsonb,

  -- Per-question grading against expected_signals.
  answer_breakdown jsonb not null default '[]'::jsonb,

  recommendation text not null
    check (recommendation in ('strong_hire', 'hire', 'lean_hire', 'no_hire', 'strong_no_hire')),
  rationale text,

  -- Historical cases retrieved before the recommendation was formed.
  evidence jsonb not null default '[]'::jsonb,

  model text,
  run_id uuid,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_evaluations_candidate on public.evaluations (candidate_id, created_at desc);
create index if not exists idx_evaluations_transcript on public.evaluations (transcript_id);
create index if not exists idx_evaluations_job on public.evaluations (job_id);
