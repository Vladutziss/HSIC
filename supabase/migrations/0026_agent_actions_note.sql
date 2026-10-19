-- The coach agent can propose to remember something about the player (a constraint, a preference, an event):
-- a new action kind `add_note`. The player confirms it; applying it inserts a user_context row (the app does that
-- with the player's own session). Safe to rerun.
alter table public.agent_actions drop constraint if exists agent_actions_kind_check;
alter table public.agent_actions add constraint agent_actions_kind_check
  check (kind in ('create_todo', 'plan_focus', 'set_reminder', 'change_habit', 'add_habit', 'start_experiment', 'add_note'));
