-- Repeating to-dos. One row is the whole series: `date` is the first day, `repeat` holds
-- {kind: daily|weekly|days, days: [0-6], until: date|null}, and `done_days` the days whose
-- occurrence is ticked. Rows that do not repeat keep done / done_on as before.
-- RLS already covers the table, so the new columns need no policy.

alter table public.todos
  add column repeat jsonb,
  add column done_days jsonb not null default '[]'::jsonb;
