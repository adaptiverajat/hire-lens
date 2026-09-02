-- HireLens :: 0003 :: jobs and extracted JD requirements

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text,
  location text,
  employment_type text
    check (employment_type is null or employment_type in ('full_time', 'part_time', 'contract', 'internship')),
  seniority text,
  min_years_experience numeric(4, 1),
  max_years_experience numeric(4, 1),

  -- Raw JD as supplied (paste or extracted from an upload).
  description_raw text not null,
  source_file_path text,
  source_file_name text,

  -- Structured JD Agent output (skills, technologies, certifications, domains...).
  structured jsonb,
  parse_status text not null default 'pending'
    check (parse_status in ('pending', 'processing', 'complete', 'failed')),
  parse_error text,

  status text not null default 'open'
    check (status in ('draft', 'open', 'on_hold', 'closed')),
  opened_at timestamptz not null default timezone('utc', now()),
  deadline_date timestamptz,

  created_by uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_jobs_created_by on public.jobs (created_by);
create index if not exists idx_jobs_status on public.jobs (status);
create index if not exists idx_jobs_created_at on public.jobs (created_at desc);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- Normalised requirement rows extracted from the JD.
create table if not exists public.job_skills (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,

  -- `skill` is the normalised form ("javascript"); `raw_label` is what the JD said ("JS").
  skill text not null,
  raw_label text,
  category text not null default 'skill'
    check (category in ('skill', 'technology', 'experience', 'certification', 'domain')),

  -- 0-100 weighting used by the gap analysis agent.
  importance integer not null default 50 check (importance between 0 and 100),
  is_required boolean not null default true,
  min_years numeric(4, 1),
  notes text,

  created_at timestamptz not null default timezone('utc', now()),
  unique (job_id, skill, category)
);

create index if not exists idx_job_skills_job_id on public.job_skills (job_id);
create index if not exists idx_job_skills_skill on public.job_skills (skill);
