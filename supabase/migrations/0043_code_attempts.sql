-- Guessing codes: plan codes (redeem_plan_code) and family invites (family_join) could be tried without limit, so a
-- stranger could guess a code and get Pro for free, take a school's seats or link to a student. Now every failed
-- try (unknown, used up, expired, already used, own code) is recorded per account, and after 10 failed tries in an
-- hour the next one, right or wrong, is refused with 'too_many_attempts' until the hour has passed.
-- Codes made by a site admin are also checked: at least 8 characters, and a blank code is generated at random
-- (MLT- plus 12 hex characters). School codes (SCH-) and family invites are already random.

create table public.code_attempts (
  id bigint generated always as identity primary key,
  user_id text not null references public.profiles (id) on delete cascade,
  at timestamptz not null default now()
);
create index code_attempts_user_at on public.code_attempts (user_id, at desc);
alter table public.code_attempts enable row level security;
revoke all on public.code_attempts from anon, authenticated;
grant all on public.code_attempts to service_role;

create function public._code_guard(p_user text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.code_attempts a where a.user_id = p_user and a.at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_attempts';
  end if;
end $$;

create function public._code_fail(p_user text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.code_attempts (user_id) values (p_user);
  delete from public.code_attempts a where a.user_id = p_user and a.at < now() - interval '1 day';
end $$;
revoke execute on function public._code_guard(text), public._code_fail(text) from public, anon, authenticated;

create or replace function public.redeem_plan_code(p_code text) returns table (plan text, until timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  c public.plan_codes%rowtype;
  s public.schools%rowtype;
  base timestamptz;
  ends timestamptz;
begin
  if me is null then raise exception 'not authenticated'; end if;
  perform public._code_guard(me);
  select * into c from public.plan_codes where code = upper(trim(p_code)) for update;
  if not found or c.uses >= c.max_uses or (c.expires_at is not null and c.expires_at < now()) then
    perform public._code_fail(me);
    return;
  end if;
  if c.school_id is not null then
    select * into s from public.schools where id = c.school_id;
    if not found or s.until <= now() then perform public._code_fail(me); return; end if;
    -- one school per account; a student code needs a free seat
    if exists (select 1 from public.school_members m where m.user_id = me and m.school_id <> c.school_id) then perform public._code_fail(me); return; end if;
    if c.role = 'student'
       and not exists (select 1 from public.school_members m where m.user_id = me and m.school_id = c.school_id)
       and (select count(*) from public.school_members m where m.school_id = c.school_id and m.role = 'student') >= s.seats then
      perform public._code_fail(me);
      return;
    end if;
  end if;
  insert into public.plan_code_redemptions (code, user_id) values (c.code, me) on conflict do nothing;
  if not found then perform public._code_fail(me); return; end if;
  update public.plan_codes set uses = uses + 1 where code = c.code;
  select case when up.plan = c.plan and up.until > now() then up.until else now() end into base
  from (select 1) x left join public.user_plans up on up.user_id = me;
  base := coalesce(base, now());
  ends := base + make_interval(days => c.days);
  if c.school_id is not null then ends := least(ends, s.until); end if;
  insert into public.user_plans as u (user_id, plan, until, source) values (me, c.plan, ends, 'code')
  on conflict (user_id) do update set plan = excluded.plan, until = excluded.until, source = 'code';
  if c.school_id is not null then
    insert into public.school_members (school_id, user_id, role) values (c.school_id, me, c.role) on conflict (school_id, user_id) do nothing;
  end if;
  return query select up.plan, up.until from public.user_plans up where up.user_id = me;
end $$;

create or replace function public.family_join(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  inv public.family_invites%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  perform public._code_guard(me);
  select * into inv from public.family_invites i where i.code = upper(trim(p_code)) and i.expires_at > now() for update;
  if not found or inv.student_id = me then perform public._code_fail(me); return null; end if;
  if (select count(*) from public.family_links l where l.student_id = inv.student_id) >= 3 then perform public._code_fail(me); return null; end if;
  insert into public.family_links (student_id, parent_id) values (inv.student_id, me) on conflict do nothing;
  delete from public.family_invites i where i.code = inv.code;
  return (select p.name from public.profiles p where p.id = inv.student_id);
end $$;

create or replace function public.admin_create_code(p_code text, p_plan text, p_days int, p_max_uses int, p_label text, p_school uuid default null, p_role text default 'student') returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text := upper(trim(coalesce(p_code, '')));
begin
  if not public.is_site_admin() then raise exception 'forbidden'; end if;
  if v_code = '' then v_code := 'MLT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)); end if;
  if length(v_code) < 8 then raise exception 'code too short'; end if;
  insert into public.plan_codes (code, plan, days, max_uses, label, school_id, role)
  values (v_code, p_plan, p_days, p_max_uses, left(coalesce(p_label, ''), 80), p_school, p_role);
  return v_code;
end $$;
