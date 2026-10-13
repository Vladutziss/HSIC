-- Daily-plan steps can now be Focus sessions: a new action kind `plan_focus` (applied like create_todo,
-- the to-do carries focus: true and its duration). Safe to rerun.
alter table public.agent_actions drop constraint if exists agent_actions_kind_check;
alter table public.agent_actions add constraint agent_actions_kind_check
  check (kind in ('create_todo', 'plan_focus', 'set_reminder', 'change_habit', 'add_habit', 'start_experiment'));
