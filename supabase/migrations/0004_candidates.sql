-- HireLens :: 0004 :: candidates, extracted profile and JD/resume match analysis

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,

  full_name text not null,
  email text,
  phone text,
  location text,
  headline text,
  total_years_experience numeric(4, 1),

  -- Raw resume text as supplied (paste or extracted from an upload).
  resume_raw text,
  source_file_path text,
  source_file_name text,

  -- Structured Resume Agent output (skills, projects, experience, education...).
  structured jsonb,
  parse_status text not null default 'pending'
    check (parse_status in ('pending', 'processing', 'complete', 'failed')),
  parse_error text,

  status text not null default 'new'
    check (status in ('new', 'screening', 'interviewing', 'offer', 'hired', 'rejected', 'on_hold')),

  created_by uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_candidates_job_id on public.candidates (job_id);
create index if not exists idx_candidates_status on public.candidates (status);
create index if not exists idx_candidates_created_at on public.candidates (created_at desc);

create trigger candidates_set_updated_at
  before update on public.candidates
  for each row execute function public.set_updated_at();

-- Normalised skill rows extracted from the resume.
create table if not exists public.candidate_skills (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,

  skill text not null,
  raw_label text,
  category text not null default 'skill'
    check (category in ('skill', 'technology', 'experience', 'certification', 'domain')),

  proficiency text
    check (proficiency is null or proficiency in ('beginner', 'intermediate', 'advanced', 'expert')),
  years numeric(4, 1),

  -- Where in the resume this claim came from - keeps recommendations evidence-based.
  evidence text,

  created_at timestamptz not null default timezone('utc', now()),
  unique (candidate_id, skill, category)
);

create index if not exists idx_candidate_skills_candidate_id on public.candidate_skills (candidate_id);
create index if not exists idx_candidate_skills_skill on public.candidate_skills (skill);

-- Gap Analysis Agent output: one row per JD-vs-resume comparison run.
create table if not exists public.match_analyses (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,

  match_score integer not null check (match_score between 0 and 100),
  verdict text
    check (verdict is null or verdict in ('strong_match', 'partial_match', 'weak_match')),

  strong_skills jsonb not null default '[]'::jsonb,
  missing_skills jsonb not null default '[]'::jsonb,
  areas_to_validate jsonb not null default '[]'::jsonb,
  summary text,

  -- Historical cases the Evidence Retrieval Agent surfaced for this run.
  evidence jsonb not null default '[]'::jsonb,

  model text,
  run_id uuid,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_match_analyses_candidate on public.match_analyses (candidate_id, created_at desc);
create index if not exists idx_match_analyses_job on public.match_analyses (job_id);
