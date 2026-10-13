-- Limits: at most 3 groups and 3 progress partners per person, and a partnership is two people.
-- Keep the numbers in step with MAX_GROUPS, MAX_PARTNERS and PARTNER_SIZE in src/lib/groups.js.
-- Joining and creating only happen through these two functions (group_members has no insert policy),
-- so this is where the limit is enforced. Errors the client recognises: group_limit, partner_full, bad_kind.

create or replace function public.create_group(gname text, gkind text default 'group', stats jsonb default '{}')
returns table (id text, code text)
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  gid text := 'g' || to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint) || substr(md5(random()::text), 1, 4);
  gcode text := public.new_group_code();
  max_per_kind constant int := 3;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if gkind not in ('group', 'partner') then raise exception 'bad_kind'; end if;
  if (select count(*) from public.group_members m join public.groups g on g.id = m.group_id
      where m.user_id = me and g.kind = gkind) >= max_per_kind then
    raise exception 'group_limit';
  end if;
  insert into public.groups (id, name, code, kind, owner) values (gid, left(trim(gname), 40), gcode, gkind, me);
  insert into public.group_members (group_id, user_id, stats) values (gid, me, coalesce(stats, '{}'));
  return query select gid, gcode;
end $$;

-- returns the group id, or null when the code matches nothing
create or replace function public.join_group(gcode text, stats jsonb default '{}') returns text
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  gid text;
  gkind text;
  max_per_kind constant int := 3;
  partner_size constant int := 2;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select g.id, g.kind into gid, gkind from public.groups g where g.code = upper(trim(gcode));
  if gid is null then return null; end if;
  -- already in: nothing to check, nothing to add
  if exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = me) then return gid; end if;
  if gkind = 'partner' and (select count(*) from public.group_members m where m.group_id = gid) >= partner_size then
    raise exception 'partner_full';
  end if;
  if (select count(*) from public.group_members m join public.groups g on g.id = m.group_id
      where m.user_id = me and g.kind = gkind) >= max_per_kind then
    raise exception 'group_limit';
  end if;
  insert into public.group_members (group_id, user_id, stats) values (gid, me, coalesce(stats, '{}'))
  on conflict (group_id, user_id) do nothing;
  return gid;
end $$;
