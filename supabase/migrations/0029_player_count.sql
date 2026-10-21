-- Public number of players for the landing page: the row count of public.profiles, and nothing else. profiles has RLS
-- (each player reads only their own row), so anon cannot count it directly; security definer returns just the total.
-- Safe to rerun.

create or replace function public.player_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from public.profiles;
$$;

revoke all on function public.player_count() from public;
grant execute on function public.player_count() to anon, authenticated;
