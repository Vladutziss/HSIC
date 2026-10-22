-- From 2026-10-30 Supabase no longer grants Data API access automatically to new tables in public.
-- Migrations 0001-0030 assumed those default grants, so a fresh project / preview branch / db reset
-- would get tables nobody can reach. This restores them (no-op on Momentum, where they already exist).
-- anon gets nothing here: 0002 revoked it everywhere and the public pages use RPC functions or the explicit grants in 0012.

-- service_role (Edge Functions, bypasses RLS): everything
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- authenticated: RLS decides the rest. Skipped tables were locked down on purpose
-- (0003/0009 group_profiles, 0011 push_subscriptions, 0012 site_admins/team_*, 0031 giveaway_*, 0032 email_*, 0039 chat_runs)
-- and keep their own grants.
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      and c.relname not in ('group_profiles', 'push_subscriptions', 'site_admins', 'team_members', 'team_photos', 'chat_runs')
      and c.relname not like 'giveaway\_%' and c.relname not like 'email\_%'
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t.relname);
  end loop;
end $$;
grant usage on all sequences in schema public to authenticated;
