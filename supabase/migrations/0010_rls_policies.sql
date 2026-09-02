-- HireLens :: 0010 :: row level security
-- Server routes use the service-role key and scope every query explicitly.
-- These policies are defence-in-depth for anything reaching Postgres with a
-- user JWT (direct client reads, SQL editor sessions, future realtime).

-- Ownership helpers -----------------------------------------------------------

create or replace function public.owns_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job_id and j.created_by = auth.uid()
  );
$$;

create or replace function public.owns_candidate(p_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.candidates c
    join public.jobs j on j.id = c.job_id
    where c.id = p_candidate_id and j.created_by = auth.uid()
  );
$$;

-- Enable RLS ------------------------------------------------------------------

alter table public.users             enable row level security;
alter table public.jobs              enable row level security;
alter table public.job_skills        enable row level security;
alter table public.candidates        enable row level security;
alter table public.candidate_skills  enable row level security;
alter table public.match_analyses    enable row level security;
alter table public.question_sets     enable row level security;
alter table public.questions         enable row level security;
alter table public.interviews        enable row level security;
alter table public.transcripts       enable row level security;
alter table public.evaluations       enable row level security;
alter table public.flags             enable row level security;
alter table public.feedback          enable row level security;
alter table public.knowledge_entries enable row level security;
alter table public.embeddings        enable row level security;
alter table public.agent_runs        enable row level security;

-- users -----------------------------------------------------------------------

drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users
  for select using (id = auth.uid());

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- jobs ------------------------------------------------------------------------

drop policy if exists jobs_owner_all on public.jobs;
create policy jobs_owner_all on public.jobs
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

-- job_skills ------------------------------------------------------------------

drop policy if exists job_skills_via_job on public.job_skills;
create policy job_skills_via_job on public.job_skills
  for all using (public.owns_job(job_id)) with check (public.owns_job(job_id));

-- candidates ------------------------------------------------------------------

drop policy if exists candidates_via_job on public.candidates;
create policy candidates_via_job on public.candidates
  for all using (public.owns_job(job_id)) with check (public.owns_job(job_id));

-- candidate_skills ------------------------------------------------------------

drop policy if exists candidate_skills_via_candidate on public.candidate_skills;
create policy candidate_skills_via_candidate on public.candidate_skills
  for all using (public.owns_candidate(candidate_id)) with check (public.owns_candidate(candidate_id));

-- match_analyses --------------------------------------------------------------

drop policy if exists match_analyses_via_job on public.match_analyses;
create policy match_analyses_via_job on public.match_analyses
  for all using (public.owns_job(job_id)) with check (public.owns_job(job_id));

-- question_sets / questions ---------------------------------------------------

drop policy if exists question_sets_via_job on public.question_sets;
create policy question_sets_via_job on public.question_sets
  for all using (public.owns_job(job_id)) with check (public.owns_job(job_id));

drop policy if exists questions_via_job on public.questions;
create policy questions_via_job on public.questions
  for all using (public.owns_job(job_id)) with check (public.owns_job(job_id));

-- interviews / transcripts / evaluations --------------------------------------

drop policy if exists interviews_via_job on public.interviews;
create policy interviews_via_job on public.interviews
  for all using (public.owns_job(job_id)) with check (public.owns_job(job_id));

drop policy if exists transcripts_via_interview on public.transcripts;
create policy transcripts_via_interview on public.transcripts
  for all using (
    exists (
      select 1 from public.interviews i
      where i.id = transcripts.interview_id and public.owns_job(i.job_id)
    )
  )
  with check (
    exists (
      select 1 from public.interviews i
      where i.id = transcripts.interview_id and public.owns_job(i.job_id)
    )
  );

drop policy if exists evaluations_via_job on public.evaluations;
create policy evaluations_via_job on public.evaluations
  for all using (public.owns_job(job_id)) with check (public.owns_job(job_id));

-- flags / feedback ------------------------------------------------------------

drop policy if exists flags_via_job on public.flags;
create policy flags_via_job on public.flags
  for all using (public.owns_job(job_id)) with check (public.owns_job(job_id));

drop policy if exists feedback_via_job on public.feedback;
create policy feedback_via_job on public.feedback
  for all using (public.owns_job(job_id)) with check (public.owns_job(job_id));

-- knowledge_entries -----------------------------------------------------------
-- Readable by any authenticated user (organisational memory is shared);
-- writes are restricted to the author.

drop policy if exists knowledge_select_authenticated on public.knowledge_entries;
create policy knowledge_select_authenticated on public.knowledge_entries
  for select using (auth.uid() is not null);

drop policy if exists knowledge_write_own on public.knowledge_entries;
create policy knowledge_write_own on public.knowledge_entries
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

-- embeddings ------------------------------------------------------------------

drop policy if exists embeddings_own on public.embeddings;
create policy embeddings_own on public.embeddings
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- agent_runs ------------------------------------------------------------------

drop policy if exists agent_runs_own on public.agent_runs;
create policy agent_runs_own on public.agent_runs
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());
