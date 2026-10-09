-- Clerk replaces Supabase Auth. A Clerk user id is text ("user_2abc..."), not a uuid, and the token reaches
-- Postgres through Supabase's third-party auth (Dashboard -> Authentication -> Sign In / Providers -> Clerk).
--
-- * public.requesting_user_id() reads the verified JWT's `sub`; it takes the place of auth.uid() everywhere.
-- * Every user column becomes text and references public.profiles (cascade) instead of auth.users.
-- * No signup trigger any more: the app calls ensure_profile() after the first sign-in.
-- * Rows written under the old Supabase Auth ids stay in place but no Clerk user can reach them.

-- ------------------------------------------------------------ drop what depends on the old columns
drop view if exists public.group_profiles;

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists habits_all on public.habits;
drop policy if exists day_reviews_all on public.day_reviews;
drop policy if exists todos_all on public.todos;
drop policy if exists chapters_all on public.chapters;
drop policy if exists streak_revives_all on public.streak_revives;
drop policy if exists completions_all on public.completions;
drop policy if exists ai_usage_select on public.ai_usage;
drop policy if exists groups_select on public.groups;
drop policy if exists groups_delete on public.groups;
drop policy if exists group_members_select on public.group_members;
drop policy if exists group_members_update on public.group_members;
drop policy if exists group_members_delete on public.group_members;
drop policy if exists nudges_select on public.nudges;
drop policy if exists nudges_insert on public.nudges;
drop policy if exists nudge_reads_select on public.nudge_reads;
drop policy if exists nudge_reads_insert on public.nudge_reads;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.create_group(text, text, jsonb);
drop function if exists public.join_group(text, jsonb);
drop function if exists public.bump_ai_usage(int);
drop function if exists public.delete_my_account();
drop function if exists public.nudge_targets_ok(text, uuid[]);
drop function if exists public.is_group_member(text);

-- ------------------------------------------------------------ columns: uuid -> text, auth.users -> profiles
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.habits drop constraint habits_user_id_fkey;
alter table public.completions drop constraint completions_user_id_fkey;
alter table public.day_reviews drop constraint day_reviews_user_id_fkey;
alter table public.todos drop constraint todos_user_id_fkey;
alter table public.chapters drop constraint chapters_user_id_fkey;
alter table public.streak_revives drop constraint streak_revives_user_id_fkey;
alter table public.groups drop constraint groups_owner_fkey;
alter table public.group_members drop constraint group_members_user_id_fkey;
alter table public.nudges drop constraint nudges_from_user_fkey;
alter table public.nudge_reads drop constraint nudge_reads_user_id_fkey;
alter table public.ai_usage drop constraint ai_usage_user_id_fkey;

alter table public.profiles alter column id type text using id::text;
alter table public.habits alter column user_id type text using user_id::text;
alter table public.completions alter column user_id type text using user_id::text;
alter table public.day_reviews alter column user_id type text using user_id::text;
alter table public.todos alter column user_id type text using user_id::text;
alter table public.chapters alter column user_id type text using user_id::text;
alter table public.streak_revives alter column user_id type text using user_id::text;
alter table public.groups alter column owner type text using owner::text;
alter table public.group_members alter column user_id type text using user_id::text;
alter table public.nudges alter column from_user type text using from_user::text;
alter table public.nudges alter column to_users type text[] using to_users::text[];
alter table public.nudge_reads alter column user_id type text using user_id::text;
alter table public.ai_usage alter column user_id type text using user_id::text;

-- rows of users that never had a profile cannot satisfy the new foreign keys
delete from public.habits where user_id not in (select id from public.profiles);
delete from public.completions where user_id not in (select id from public.profiles);
delete from public.day_reviews where user_id not in (select id from public.profiles);
delete from public.todos where user_id not in (select id from public.profiles);
delete from public.chapters where user_id not in (select id from public.profiles);
delete from public.streak_revives where user_id not in (select id from public.profiles);
delete from public.groups where owner not in (select id from public.profiles);
delete from public.group_members where user_id not in (select id from public.profiles);
delete from public.nudges where from_user not in (select id from public.profiles);
delete from public.nudge_reads where user_id not in (select id from public.profiles);
delete from public.ai_usage where user_id not in (select id from public.profiles);

alter table public.habits add foreign key (user_id) references public.profiles on delete cascade;
alter table public.completions add foreign key (user_id) references public.profiles on delete cascade;
alter table public.day_reviews add foreign key (user_id) references public.profiles on delete cascade;
alter table public.todos add foreign key (user_id) references public.profiles on delete cascade;
alter table public.chapters add foreign key (user_id) references public.profiles on delete cascade;
alter table public.streak_revives add foreign key (user_id) references public.profiles on delete cascade;
alter table public.groups add foreign key (owner) references public.profiles on delete cascade;
alter table public.group_members add foreign key (user_id) references public.profiles on delete cascade;
alter table public.nudges add foreign key (from_user) references public.profiles on delete cascade;
alter table public.nudge_reads add foreign key (user_id) references public.profiles on delete cascade;
alter table public.ai_usage add foreign key (user_id) references public.profiles on delete cascade;

-- ------------------------------------------------------------ who is calling
create function public.requesting_user_id() returns text
language sql stable set search_path = '' as $$
  select nullif(auth.jwt() ->> 'sub', '');
$$;
revoke execute on function public.requesting_user_id() from public, anon;
grant execute on function public.requesting_user_id() to authenticated;

-- first sign-in: the profile row (the signup trigger used to make it)
create function public.ensure_profile(pname text default '', pavatar text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
begin
  if me is null then raise exception 'not authenticated'; end if;
  insert into public.profiles (id, name, avatar_url) values (me, left(coalesce(pname, ''), 80), pavatar)
  on conflict (id) do nothing;
end $$;

-- ------------------------------------------------------------ policies (same rules as 0002 / 0003)
create policy profiles_select on public.profiles for select to authenticated using (id = (select public.requesting_user_id()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select public.requesting_user_id())) with check (id = (select public.requesting_user_id()));

create policy habits_all on public.habits for all to authenticated
  using (user_id = (select public.requesting_user_id())) with check (user_id = (select public.requesting_user_id()));
create policy day_reviews_all on public.day_reviews for all to authenticated
  using (user_id = (select public.requesting_user_id())) with check (user_id = (select public.requesting_user_id()));
create policy todos_all on public.todos for all to authenticated
  using (user_id = (select public.requesting_user_id())) with check (user_id = (select public.requesting_user_id()));
create policy chapters_all on public.chapters for all to authenticated
  using (user_id = (select public.requesting_user_id())) with check (user_id = (select public.requesting_user_id()));
create policy streak_revives_all on public.streak_revives for all to authenticated
  using (user_id = (select public.requesting_user_id())) with check (user_id = (select public.requesting_user_id()));
create policy completions_all on public.completions for all to authenticated
  using (user_id = (select public.requesting_user_id()))
  with check (
    user_id = (select public.requesting_user_id())
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select public.requesting_user_id()))
  );
create policy ai_usage_select on public.ai_usage for select to authenticated using (user_id = (select public.requesting_user_id()));

create function public.is_group_member(gid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members m where m.group_id = gid and m.user_id = (select public.requesting_user_id())
  );
$$;

create function public.nudge_targets_ok(gid text, targets text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select cardinality(targets) between 1 and 50
    and (select count(*) from public.group_members m where m.group_id = gid and m.user_id = any (targets)) = cardinality(targets);
$$;

create policy groups_select on public.groups for select to authenticated using (public.is_group_member(id));
create policy groups_delete on public.groups for delete to authenticated using (owner = (select public.requesting_user_id()));

create policy group_members_select on public.group_members for select to authenticated using (public.is_group_member(group_id));
create policy group_members_update on public.group_members for update to authenticated
  using (user_id = (select public.requesting_user_id())) with check (user_id = (select public.requesting_user_id()));
create policy group_members_delete on public.group_members for delete to authenticated using (user_id = (select public.requesting_user_id()));

create policy nudges_select on public.nudges for select to authenticated
  using (from_user = (select public.requesting_user_id()) or (select public.requesting_user_id()) = any (to_users));
create policy nudges_insert on public.nudges for insert to authenticated
  with check (
    from_user = (select public.requesting_user_id())
    and public.is_group_member(group_id)
    and public.nudge_targets_ok(group_id, to_users)
  );

create policy nudge_reads_select on public.nudge_reads for select to authenticated using (user_id = (select public.requesting_user_id()));
create policy nudge_reads_insert on public.nudge_reads for insert to authenticated
  with check (
    user_id = (select public.requesting_user_id())
    and exists (select 1 from public.nudges n where n.id = nudge_id and (select public.requesting_user_id()) = any (n.to_users))
  );

create view public.group_profiles as
  select p.id, p.name, p.avatar_url
  from public.profiles p
  where p.id = (select public.requesting_user_id())
     or exists (
       select 1
       from public.group_members a
       join public.group_members b on b.group_id = a.group_id
       where a.user_id = (select public.requesting_user_id()) and b.user_id = p.id
     );
revoke all on public.group_profiles from anon;
grant select on public.group_profiles to authenticated;

-- ------------------------------------------------------------ RPCs (same as 0003, text ids)
create function public.create_group(gname text, gkind text default 'group', stats jsonb default '{}')
returns table (id text, code text)
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  gid text := 'g' || to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint) || substr(md5(random()::text), 1, 4);
  gcode text := public.new_group_code();
begin
  if me is null then raise exception 'not authenticated'; end if;
  insert into public.groups (id, name, code, kind, owner) values (gid, left(trim(gname), 40), gcode, gkind, me);
  insert into public.group_members (group_id, user_id, stats) values (gid, me, coalesce(stats, '{}'));
  return query select gid, gcode;
end $$;

create function public.join_group(gcode text, stats jsonb default '{}') returns text
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  gid text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select g.id into gid from public.groups g where g.code = upper(trim(gcode));
  if gid is null then return null; end if;
  insert into public.group_members (group_id, user_id, stats) values (gid, me, coalesce(stats, '{}'))
  on conflict (group_id, user_id) do nothing;
  return gid;
end $$;

create function public.bump_ai_usage(daily_max int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  used int;
begin
  if me is null then return false; end if;
  insert into public.ai_usage as u (user_id, day, count) values (me, current_date, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count into used;
  return used <= daily_max;
end $$;

-- cascades remove every row; the client then deletes the Clerk user itself
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select public.requesting_user_id()) is null then raise exception 'not authenticated'; end if;
  delete from public.profiles where id = (select public.requesting_user_id());
end $$;

revoke execute on function public.ensure_profile(text, text), public.create_group(text, text, jsonb), public.join_group(text, jsonb),
  public.bump_ai_usage(int), public.delete_my_account(), public.is_group_member(text),
  public.nudge_targets_ok(text, text[]) from public, anon;
grant execute on function public.ensure_profile(text, text), public.create_group(text, text, jsonb), public.join_group(text, jsonb),
  public.bump_ai_usage(int), public.delete_my_account(), public.is_group_member(text),
  public.nudge_targets_ok(text, text[]) to authenticated;
