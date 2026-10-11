-- Single-user (n-of-1) experiments: the coach proposes a 2-week test of one factor on one habit,
-- days are randomly assigned to arm A or B (assignments: { 'YYYY-MM-DD': 'A'|'B' }), and the result
-- (apps/app/src/lib/experiments.js analyzeExperiment) is stored when the experiment is closed.
-- Owner-only, like every user table (see 0009_clerk.sql).

create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default public.requesting_user_id() references public.profiles(id) on delete cascade,
  habit_id text,
  factor text not null,
  arm_a text,
  arm_b text,
  start_day date not null,
  end_day date not null,
  assignments jsonb not null,
  status text not null default 'running' check (status in ('running', 'done', 'cancelled')),
  result jsonb,
  created_at timestamptz not null default now()
);

create index experiments_user_status on public.experiments (user_id, status);
-- one running experiment per user at a time
create unique index experiments_one_running on public.experiments (user_id) where status = 'running';

alter table public.experiments enable row level security;

create policy experiments_select on public.experiments for select to authenticated
  using (user_id = (select public.requesting_user_id()));
create policy experiments_insert on public.experiments for insert to authenticated
  with check (user_id = (select public.requesting_user_id()));
create policy experiments_update on public.experiments for update to authenticated
  using (user_id = (select public.requesting_user_id())) with check (user_id = (select public.requesting_user_id()));
create policy experiments_delete on public.experiments for delete to authenticated
  using (user_id = (select public.requesting_user_id()));
