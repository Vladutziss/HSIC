-- Public, aggregate-only numbers about the coach agent, for the landing page and the pitch. security definer so it can
-- count across players; it returns only totals, and null until there are enough decided proposals from enough
-- players (20 and 3) for the numbers not to point at anyone. "Proposals" are the ones that needed the player's tap
-- (autonomy = confirm); the verdicts are the before/after comparison of lib/outcomes.js, never a proven cause.
-- Safe to rerun.

create or replace function public.agent_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with a as (select user_id, status, outcome ->> 'verdict' as verdict from public.agent_actions where autonomy = 'confirm')
  select case
    when count(*) filter (where status in ('applied', 'rejected', 'undone')) < 20 or count(distinct user_id) < 3 then null
    else jsonb_build_object(
      'proposals', count(*),
      'decided', count(*) filter (where status in ('applied', 'rejected', 'undone')),
      'applied', count(*) filter (where status = 'applied'),
      'measured', count(*) filter (where verdict in ('improved', 'worse', 'no_clear_change')),
      'improved', count(*) filter (where verdict = 'improved'),
      'players', count(distinct user_id)
    )
  end
  from a;
$$;

revoke all on function public.agent_stats() from public;
grant execute on function public.agent_stats() to anon, authenticated;
