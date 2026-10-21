-- Public, aggregate-only numbers for the landing page: how many players, how active, how much done, plus the coach
-- agent's numbers (agent_stats(), null until there is enough data). security definer so it can count across players;
-- it returns only totals, never a row or an id. Safe to rerun.

create or replace function public.public_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'users', (select count(*) from public.profiles where onboarded),
    'active7', (select count(distinct user_id) from public.completions where day >= current_date - 7),
    'checkins', (select count(*) from public.completions),
    'habits', (select count(*) from public.habits where archived_at is null),
    'todosDone', (select count(*) from public.todos where done),
    'objectives', (
      select coalesce(sum(jsonb_array_length(extra -> 'objectives')) filter (where jsonb_typeof(extra -> 'objectives') = 'array'), 0)
           + coalesce(sum(jsonb_array_length(extra -> 'goals')) filter (where jsonb_typeof(extra -> 'goals') = 'array'), 0)
      from public.profiles
    ),
    'agent', public.agent_stats()
  );
$$;

revoke all on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;
