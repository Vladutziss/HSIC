-- What the coach agent did, why, and what came of it (supabase/functions/agent).
--
-- One row per action. `before` holds what is needed to undo it; `baseline` the player's own completion
-- rates when it was taken; `outcome` is filled in two weeks later by the agent, which is how the loop closes.
-- `pending` rows are proposals that need the player's tap (they change the plan); `applied` rows were
-- reversible and low risk (a to-do, a reminder time) and were done automatically, with an undo.
-- Rows are written by the Edge Function (the player's JWT, or the service role in the weekly run).

create table public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default public.requesting_user_id() references public.profiles(id) on delete cascade,
  run_id text not null, -- one weekly run (or one on-demand request) groups its actions
  kind text not null check (kind in ('create_todo', 'set_reminder', 'change_habit', 'add_habit', 'start_experiment')),
  autonomy text not null check (autonomy in ('auto', 'confirm')),
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected', 'undone', 'failed')),
  habit_id text,
  payload jsonb not null,
  before jsonb,
  reason text not null check (length(reason) between 1 and 400),
  sources jsonb not null default '[]',
  baseline jsonb,
  outcome jsonb,
  outcome_due date,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index agent_actions_user on public.agent_actions (user_id, created_at desc);
create index agent_actions_due on public.agent_actions (outcome_due) where outcome is null and status = 'applied';

alter table public.agent_actions enable row level security;
create policy agent_actions_select on public.agent_actions for select to authenticated
  using (user_id = (select public.requesting_user_id()));
create policy agent_actions_insert on public.agent_actions for insert to authenticated
  with check (user_id = (select public.requesting_user_id()));
create policy agent_actions_update on public.agent_actions for update to authenticated
  using (user_id = (select public.requesting_user_id())) with check (user_id = (select public.requesting_user_id()));
-- no delete policy: the log is kept; the account deletion cascades through profiles
