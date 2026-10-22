-- A to-do can carry a Focus session: it shows a "Focus" button that starts the timer on it. Until now only the coach
-- set the flag (plan_focus) and it lived in the page's memory; the player can now tick it in the to-do editor, so it is stored.
-- RLS already covers the table, so the new column needs no policy.

alter table public.todos
  add column focus boolean not null default false;
