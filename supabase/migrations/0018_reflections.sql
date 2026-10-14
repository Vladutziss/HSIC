-- Weekly reflections: what the player wrote and what the coach answered (Stats -> "Reflecție de săptămână").
--
-- Append-only history: one row per answer. There is no update or delete policy; account deletion
-- cascades through profiles. Written by the app with the player's own JWT.

create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default public.requesting_user_id() references public.profiles(id) on delete cascade,
  week text not null, -- ISO week, e.g. 2026-W41
  answer text not null check (length(answer) between 1 and 800),
  observation text not null check (length(observation) between 1 and 400),
  next_step text not null check (length(next_step) between 1 and 400),
  data_used jsonb not null default '[]',
  confidence text not null default 'unknown' check (confidence in ('low', 'medium', 'high', 'unknown')),
  created_at timestamptz not null default now()
);
create index reflections_user on public.reflections (user_id, created_at desc);

alter table public.reflections enable row level security;
create policy reflections_select on public.reflections for select to authenticated
  using (user_id = (select public.requesting_user_id()));
create policy reflections_insert on public.reflections for insert to authenticated
  with check (user_id = (select public.requesting_user_id()));
-- no update/delete policy: the history is kept
