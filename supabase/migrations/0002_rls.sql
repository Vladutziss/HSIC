-- Row level security. The anon key ships inside every client, so these
-- policies are the only thing protecting the data: every table has RLS on.

alter table public.profiles enable row level security;
alter table public.habits enable row level security;
alter table public.completions enable row level security;
alter table public.day_reviews enable row level security;
alter table public.todos enable row level security;
alter table public.proofs enable row level security;
alter table public.chapters enable row level security;
alter table public.streak_revives enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.nudges enable row level security;
alter table public.nudge_reads enable row level security;
alter table public.ai_usage enable row level security;

-- profiles: a row is created by the signup trigger; the owner reads and edits it
create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- personal tables: the owner can do everything with their own rows
create policy habits_all on public.habits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy day_reviews_all on public.day_reviews for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy todos_all on public.todos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy chapters_all on public.chapters for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy streak_revives_all on public.streak_revives for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- rows that point at a habit must point at one of the caller's own habits
create policy completions_all on public.completions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid()))
  );
create policy proofs_all on public.proofs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (habit_id is null or exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid())))
  );

-- ai_usage: readable by the owner, written only through bump_ai_usage()
create policy ai_usage_select on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));

-- the anon role gets nothing
revoke all on all tables in schema public from anon;
