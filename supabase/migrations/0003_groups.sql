-- Groups: members see each other, outsiders see nothing. Creating and joining
-- go through RPCs because a non-member cannot read `groups` (the join code
-- is the only way in).

create function public.is_group_member(gid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members m where m.group_id = gid and m.user_id = (select auth.uid())
  );
$$;

-- every recipient of a nudge must belong to the group
create function public.nudge_targets_ok(gid text, targets uuid[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select cardinality(targets) between 1 and 50
    and (select count(*) from public.group_members m where m.group_id = gid and m.user_id = any (targets)) = cardinality(targets);
$$;

create policy groups_select on public.groups for select to authenticated using (public.is_group_member(id));
create policy groups_delete on public.groups for delete to authenticated using (owner = (select auth.uid()));

create policy group_members_select on public.group_members for select to authenticated using (public.is_group_member(group_id));
create policy group_members_update on public.group_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy group_members_delete on public.group_members for delete to authenticated using (user_id = (select auth.uid()));

create policy nudges_select on public.nudges for select to authenticated
  using (from_user = (select auth.uid()) or (select auth.uid()) = any (to_users));
create policy nudges_insert on public.nudges for insert to authenticated
  with check (
    from_user = (select auth.uid())
    and public.is_group_member(group_id)
    and public.nudge_targets_ok(group_id, to_users)
  );

create policy nudge_reads_select on public.nudge_reads for select to authenticated using (user_id = (select auth.uid()));
create policy nudge_reads_insert on public.nudge_reads for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.nudges n where n.id = nudge_id and (select auth.uid()) = any (n.to_users))
  );

-- names and avatars, only for people who share a group with the caller
create view public.group_profiles as
  select p.id, p.name, p.avatar_url
  from public.profiles p
  where p.id = (select auth.uid())
     or exists (
       select 1
       from public.group_members a
       join public.group_members b on b.group_id = a.group_id
       where a.user_id = (select auth.uid()) and b.user_id = p.id
     );
revoke all on public.group_profiles from anon;
grant select on public.group_profiles to authenticated;

-- same alphabet as src/lib/groups.js (no 0/O/1/I)
create function public.new_group_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  res text;
begin
  loop
    res := '';
    for i in 1..6 loop
      res := res || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups g where g.code = res);
  end loop;
  return res;
end $$;

create function public.create_group(gname text, gkind text default 'group', stats jsonb default '{}')
returns table (id text, code text)
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := (select auth.uid());
  gid text := 'g' || to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint) || substr(md5(random()::text), 1, 4);
  gcode text := public.new_group_code();
begin
  if me is null then raise exception 'not authenticated'; end if;
  insert into public.groups (id, name, code, kind, owner) values (gid, left(trim(gname), 40), gcode, gkind, me);
  insert into public.group_members (group_id, user_id, stats) values (gid, me, coalesce(stats, '{}'));
  return query select gid, gcode;
end $$;

-- returns the group id, or null when the code matches nothing
create function public.join_group(gcode text, stats jsonb default '{}') returns text
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := (select auth.uid());
  gid text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select g.id into gid from public.groups g where g.code = upper(trim(gcode));
  if gid is null then return null; end if;
  insert into public.group_members (group_id, user_id, stats) values (gid, me, coalesce(stats, '{}'))
  on conflict (group_id, user_id) do nothing;
  return gid;
end $$;

-- one more AI call for today; false when the daily limit is already used up
create function public.bump_ai_usage(daily_max int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := (select auth.uid());
  used int;
begin
  if me is null then return false; end if;
  insert into public.ai_usage as u (user_id, day, count) values (me, current_date, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count into used;
  return used <= daily_max;
end $$;

-- the client removes the user's files from Storage first (SQL cannot delete the
-- stored objects), then calls this; cascades remove every row
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = (select auth.uid());
end $$;

-- functions are executable by PUBLIC by default; only signed-in users get the RPCs
revoke execute on function public.create_group(text, text, jsonb), public.join_group(text, jsonb),
  public.bump_ai_usage(int), public.delete_my_account(), public.new_group_code(),
  public.is_group_member(text), public.nudge_targets_ok(text, uuid[]) from public, anon;
grant execute on function public.create_group(text, text, jsonb), public.join_group(text, jsonb),
  public.bump_ai_usage(int), public.delete_my_account(), public.is_group_member(text),
  public.nudge_targets_ok(text, uuid[]) to authenticated;

-- Realtime (it respects RLS): sync between devices and live groups
alter publication supabase_realtime add table
  public.profiles, public.habits, public.completions, public.day_reviews, public.todos,
  public.group_members, public.nudges;
