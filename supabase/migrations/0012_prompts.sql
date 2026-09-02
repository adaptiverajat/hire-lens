-- HireLens :: 0012 :: agent prompts
-- Editable agent prompts for the "Under the hood" demo panel.
-- The defaults live in src/lib/demo/prompts.ts; this table stores overrides.

create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  agent text not null unique,
  system_prompt text not null,
  user_prompt text not null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger prompts_set_updated_at
  before update on public.prompts
  for each row execute function public.set_updated_at();

alter table public.prompts enable row level security;

drop policy if exists prompts_select_authenticated on public.prompts;
create policy prompts_select_authenticated on public.prompts
  for select using (auth.uid() is not null);

drop policy if exists prompts_write_authenticated on public.prompts;
create policy prompts_write_authenticated on public.prompts
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
