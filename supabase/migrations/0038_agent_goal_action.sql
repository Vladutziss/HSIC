-- The coach can propose a goal (Obiective): a new action kind `add_goal`. The player confirms it in "Ce a făcut Molt";
-- applying it creates the objective (with its first steps) in the app, undoing it archives it.
alter table public.agent_actions drop constraint if exists agent_actions_kind_check;
alter table public.agent_actions add constraint agent_actions_kind_check
  check (kind in ('create_todo', 'plan_focus', 'set_reminder', 'change_habit', 'add_habit', 'start_experiment', 'add_note', 'add_goal'));
