-- HireLens :: 0014 :: shared workspace access
-- All authenticated users can see and manage all jobs, candidates, and
-- downstream data regardless of who created it. created_by is retained on
-- inserts for audit trail but no longer gates reads or writes.

-- Jobs: any authenticated user can read/write any job.
drop policy if exists jobs_owner_all on public.jobs;
create policy jobs_authenticated_all on public.jobs
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Job skills: any authenticated user.
drop policy if exists job_skills_via_job on public.job_skills;
create policy job_skills_authenticated on public.job_skills
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Candidates: any authenticated user.
drop policy if exists candidates_via_job on public.candidates;
create policy candidates_authenticated on public.candidates
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Candidate skills: any authenticated user.
drop policy if exists candidate_skills_via_candidate on public.candidate_skills;
create policy candidate_skills_authenticated on public.candidate_skills
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Match analyses: any authenticated user.
drop policy if exists match_analyses_via_job on public.match_analyses;
create policy match_analyses_authenticated on public.match_analyses
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Question sets: any authenticated user.
drop policy if exists question_sets_via_job on public.question_sets;
create policy question_sets_authenticated on public.question_sets
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Questions: any authenticated user.
drop policy if exists questions_via_job on public.questions;
create policy questions_authenticated on public.questions
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Interviews: any authenticated user.
drop policy if exists interviews_via_job on public.interviews;
create policy interviews_authenticated on public.interviews
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Transcripts: any authenticated user.
drop policy if exists transcripts_via_interview on public.transcripts;
create policy transcripts_authenticated on public.transcripts
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Evaluations: any authenticated user.
drop policy if exists evaluations_via_job on public.evaluations;
create policy evaluations_authenticated on public.evaluations
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Flags: any authenticated user.
drop policy if exists flags_via_job on public.flags;
create policy flags_authenticated on public.flags
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Feedback: any authenticated user.
drop policy if exists feedback_via_job on public.feedback;
create policy feedback_authenticated on public.feedback
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Embeddings: any authenticated user.
drop policy if exists embeddings_own on public.embeddings;
create policy embeddings_authenticated on public.embeddings
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Agent runs: any authenticated user.
drop policy if exists agent_runs_own on public.agent_runs;
create policy agent_runs_authenticated on public.agent_runs
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
