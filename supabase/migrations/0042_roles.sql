-- Roles on top of the plans (0041).
--
-- School roles: a school (created by a site admin) has seats and a contract end. Its members are `admin`, `teacher`
-- (the class teacher) or `student`. A school code (plan_codes.school_id) redeemed by an account makes it a member with
-- the code's role and gives it the School plan until the code's days or the contract end, whichever comes first.
--   * admin: makes teacher and student codes for the school, within its seats; sees the class panel.
--   * teacher: sees the class panel only.
--   * student: nothing extra; their rows are never shown to the school, only counted.
-- The class panel is aggregate-only: counts for the students, and nothing at all (hidden) below 5 students, so a
-- small class cannot point at a person.
--
-- Family: a student (an account) can invite a parent with a one-use code. The parent then sees, for that student only,
-- the display name and two numbers for the last 7 days (days with a check-in, check-ins). Either side can unlink at
-- any time. Nothing is shared until the student creates the invite.
--
-- Site admins (is_site_admin(), 0012) get admin_* functions to create schools and codes and to grant or take back a
-- plan, instead of the SQL editor. They accept a Clerk user id or the account's email (email_preferences).

-- ------------------------------------------------------------ schools
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  seats int not null check (seats between 1 and 5000),
  until timestamptz not null, -- end of the contract: no plan from this school outlives it
  created_at timestamptz not null default now()
);
alter table public.schools enable row level security;

create table public.school_members (
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id text not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'teacher', 'student')),
  joined_at timestamptz not null default now(),
  primary key (school_id, user_id)
);
create unique index school_members_one_school on public.school_members (user_id); -- one school per account
alter table public.school_members enable row level security;

create policy school_members_own on public.school_members for select to authenticated using (user_id = (select public.requesting_user_id()));
create policy schools_member on public.schools for select to authenticated
  using (exists (select 1 from public.school_members m where m.school_id = schools.id and m.user_id = (select public.requesting_user_id())));

alter table public.plan_codes
  add column school_id uuid references public.schools (id) on delete cascade,
  add column role text not null default 'student' check (role in ('admin', 'teacher', 'student')),
  add constraint plan_codes_school_plan check (school_id is null or plan = 'school');

-- ------------------------------------------------------------ family
create table public.family_invites (
  code text primary key check (code ~ '^[A-Z0-9]{8}$'),
  student_id text not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '3 days'
);
alter table public.family_invites enable row level security;

create table public.family_links (
  student_id text not null references public.profiles (id) on delete cascade,
  parent_id text not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, parent_id),
  check (student_id <> parent_id)
);
alter table public.family_links enable row level security;
create policy family_links_mine on public.family_links for select to authenticated
  using (student_id = (select public.requesting_user_id()) or parent_id = (select public.requesting_user_id()));

-- explicit grants (RLS decides the rest; the invites and the codes are reachable only through the functions)
revoke all on public.schools, public.school_members, public.family_invites, public.family_links from anon, authenticated;
grant select on public.schools, public.school_members, public.family_links to authenticated;
grant all on public.schools, public.school_members, public.family_invites, public.family_links to service_role;

-- ------------------------------------------------------------ redeeming: school codes add a role
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
  select * into c from public.plan_codes where code = upper(trim(p_code)) for update;
  if not found or c.uses >= c.max_uses or (c.expires_at is not null and c.expires_at < now()) then return; end if;
  if c.school_id is not null then
    select * into s from public.schools where id = c.school_id;
    if not found or s.until <= now() then return; end if;
    -- one school per account; a student code needs a free seat
    if exists (select 1 from public.school_members m where m.user_id = me and m.school_id <> c.school_id) then return; end if;
    if c.role = 'student'
       and not exists (select 1 from public.school_members m where m.user_id = me and m.school_id = c.school_id)
       and (select count(*) from public.school_members m where m.school_id = c.school_id and m.role = 'student') >= s.seats then
      return;
    end if;
  end if;
  insert into public.plan_code_redemptions (code, user_id) values (c.code, me) on conflict do nothing;
  if not found then return; end if;
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

-- ------------------------------------------------------------ school: what a member can ask
create function public.my_school() returns table (school_id uuid, name text, role text, seats int, until timestamptz, students int)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, m.role, s.seats, s.until,
         (select count(*)::int from public.school_members x where x.school_id = s.id and x.role = 'student')
  from public.school_members m join public.schools s on s.id = m.school_id
  where m.user_id = (select public.requesting_user_id());
$$;

-- aggregate-only; admin and teacher; hidden (no numbers) below 5 students
create function public.school_panel() returns table (students int, active7 int, checkins7 int, hidden boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  sid uuid;
  n int;
begin
  select m.school_id into sid from public.school_members m where m.user_id = me and m.role in ('admin', 'teacher');
  if sid is null then return; end if;
  select count(*)::int into n from public.school_members m where m.school_id = sid and m.role = 'student';
  if n < 5 then
    return query select n, null::int, null::int, true;
    return;
  end if;
  return query
    select n,
           (select count(distinct c.user_id)::int from public.completions c
              join public.school_members x on x.user_id = c.user_id and x.school_id = sid and x.role = 'student'
             where c.day >= current_date - 7),
           (select count(*)::int from public.completions c
              join public.school_members x on x.user_id = c.user_id and x.school_id = sid and x.role = 'student'
             where c.day >= current_date - 7),
           false;
end $$;

-- the school admin makes teacher or student codes, within the school's seats and contract
create function public.school_create_code(p_label text, p_role text, p_max_uses int, p_days int) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  sid uuid;
  s public.schools%rowtype;
  reserved int;
  v_code text;
begin
  select m.school_id into sid from public.school_members m where m.user_id = me and m.role = 'admin';
  if sid is null then raise exception 'not a school admin'; end if;
  if p_role not in ('teacher', 'student') then raise exception 'bad role'; end if;
  if p_max_uses is null or p_max_uses < 1 or p_max_uses > 5000 or p_days is null or p_days < 1 or p_days > 800 then raise exception 'bad input'; end if;
  select * into s from public.schools where id = sid;
  if s.until <= now() then raise exception 'contract ended'; end if;
  if p_role = 'student' then
    select count(*)::int into reserved from public.school_members m where m.school_id = sid and m.role = 'student';
    reserved := reserved + coalesce((
      select sum(greatest(c.max_uses - c.uses, 0))::int from public.plan_codes c
      where c.school_id = sid and c.role = 'student' and (c.expires_at is null or c.expires_at > now())), 0);
    if reserved + p_max_uses > s.seats then raise exception 'not enough seats'; end if;
  end if;
  loop
    v_code := 'SCH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    exit when not exists (select 1 from public.plan_codes c where c.code = v_code);
  end loop;
  insert into public.plan_codes (code, plan, days, max_uses, label, school_id, role, expires_at)
  values (v_code, 'school', p_days, p_max_uses, left(coalesce(p_label, ''), 80), sid, p_role, least(s.until, now() + interval '180 days'));
  return v_code;
end $$;

create function public.school_list_codes() returns table (code text, role text, uses int, max_uses int, expires_at timestamptz, label text)
language sql stable security definer set search_path = '' as $$
  select c.code, c.role, c.uses, c.max_uses, c.expires_at, c.label
  from public.plan_codes c
  where c.school_id = (select m.school_id from public.school_members m where m.user_id = (select public.requesting_user_id()) and m.role = 'admin')
  order by c.created_at desc;
$$;

-- ------------------------------------------------------------ family
create function public.family_create_invite() returns text
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  v_code text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if (select count(*) from public.family_links l where l.student_id = me) >= 3 then raise exception 'too many parents'; end if;
  delete from public.family_invites i where i.student_id = me;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.family_invites i where i.code = v_code);
  end loop;
  insert into public.family_invites (code, student_id) values (v_code, me);
  return v_code;
end $$;

-- returns the student's display name, or null (unknown or expired code, your own code, already 3 parents)
create function public.family_join(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  inv public.family_invites%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into inv from public.family_invites i where i.code = upper(trim(p_code)) and i.expires_at > now() for update;
  if not found or inv.student_id = me then return null; end if;
  if (select count(*) from public.family_links l where l.student_id = inv.student_id) >= 3 then return null; end if;
  insert into public.family_links (student_id, parent_id) values (inv.student_id, me) on conflict do nothing;
  delete from public.family_invites i where i.code = inv.code;
  return (select p.name from public.profiles p where p.id = inv.student_id);
end $$;

-- what a parent sees: the student's name and two numbers for the last 7 days
create function public.family_summary() returns table (student_id text, student_name text, active_days7 int, checkins7 int)
language sql stable security definer set search_path = '' as $$
  select l.student_id, p.name,
         (select count(distinct c.day)::int from public.completions c where c.user_id = l.student_id and c.day >= current_date - 7),
         (select count(*)::int from public.completions c where c.user_id = l.student_id and c.day >= current_date - 7)
  from public.family_links l join public.profiles p on p.id = l.student_id
  where l.parent_id = (select public.requesting_user_id());
$$;

-- the other side of each of my links: for a student their parents, for a parent their students
create function public.family_mine() returns table (other_id text, other_name text, kind text)
language sql stable security definer set search_path = '' as $$
  select l.parent_id, p.name, 'parent'::text from public.family_links l join public.profiles p on p.id = l.parent_id
   where l.student_id = (select public.requesting_user_id())
  union all
  select l.student_id, p.name, 'student'::text from public.family_links l join public.profiles p on p.id = l.student_id
   where l.parent_id = (select public.requesting_user_id());
$$;

create function public.family_unlink(p_other text) returns void
language plpgsql security definer set search_path = '' as $$
declare me constant text := (select public.requesting_user_id());
begin
  if me is null then raise exception 'not authenticated'; end if;
  delete from public.family_links l
  where (l.student_id = me and l.parent_id = p_other) or (l.parent_id = me and l.student_id = p_other);
end $$;

-- ------------------------------------------------------------ site admins
create function public._admin_user(p text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select pr.id from public.profiles pr where pr.id = trim(p)),
    (select e.user_id from public.email_preferences e where e.email = lower(trim(p))));
$$;
revoke execute on function public._admin_user(text) from public, anon, authenticated;

create function public.admin_create_school(p_name text, p_seats int, p_until timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_site_admin() then raise exception 'forbidden'; end if;
  insert into public.schools (name, seats, until) values (trim(p_name), p_seats, p_until) returning id into v_id;
  return v_id;
end $$;

create function public.admin_create_code(p_code text, p_plan text, p_days int, p_max_uses int, p_label text, p_school uuid default null, p_role text default 'student') returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_site_admin() then raise exception 'forbidden'; end if;
  insert into public.plan_codes (code, plan, days, max_uses, label, school_id, role)
  values (upper(trim(p_code)), p_plan, p_days, p_max_uses, left(coalesce(p_label, ''), 80), p_school, p_role);
  return upper(trim(p_code));
end $$;

-- puts an account in a school with a role (also the first admin of a school) and gives it the school's plan
create function public.admin_set_member(p_school uuid, p_user text, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user text;
  s public.schools%rowtype;
begin
  if not public.is_site_admin() then raise exception 'forbidden'; end if;
  v_user := public._admin_user(p_user);
  if v_user is null then raise exception 'unknown account'; end if;
  select * into s from public.schools where id = p_school;
  if not found then raise exception 'unknown school'; end if;
  delete from public.school_members m where m.user_id = v_user and m.school_id <> p_school;
  insert into public.school_members (school_id, user_id, role) values (p_school, v_user, p_role)
  on conflict (school_id, user_id) do update set role = excluded.role;
  insert into public.user_plans as u (user_id, plan, until, source) values (v_user, 'school', s.until, 'admin')
  on conflict (user_id) do update set plan = 'school', until = s.until, source = 'admin';
end $$;

create function public.admin_grant_plan(p_user text, p_plan text, p_days int) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user text;
begin
  if not public.is_site_admin() then raise exception 'forbidden'; end if;
  v_user := public._admin_user(p_user);
  if v_user is null then raise exception 'unknown account'; end if;
  insert into public.user_plans as u (user_id, plan, until, source) values (v_user, p_plan, now() + make_interval(days => p_days), 'admin')
  on conflict (user_id) do update set plan = excluded.plan, until = excluded.until, source = 'admin';
end $$;

create function public.admin_revoke_plan(p_user text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user text;
begin
  if not public.is_site_admin() then raise exception 'forbidden'; end if;
  v_user := public._admin_user(p_user);
  if v_user is null then raise exception 'unknown account'; end if;
  delete from public.user_plans up where up.user_id = v_user;
end $$;

create function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_site_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'plans', (select coalesce(jsonb_object_agg(t.plan, t.n), '{}') from (select up.plan, count(*) as n from public.user_plans up where up.until > now() group by up.plan) t),
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'seats', s.seats, 'until', s.until,
                  'students', (select count(*) from public.school_members m where m.school_id = s.id and m.role = 'student'),
                  'staff', (select count(*) from public.school_members m where m.school_id = s.id and m.role <> 'student')) order by s.created_at desc), '[]') from public.schools s),
    'codes', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]') from (
                select pc.code, pc.plan, pc.role, pc.school_id, pc.uses, pc.max_uses, pc.days, pc.expires_at, pc.label, pc.created_at
                from public.plan_codes pc order by pc.created_at desc limit 200) c));
end $$;

revoke execute on function
  public.my_school(), public.school_panel(), public.school_create_code(text, text, int, int), public.school_list_codes(),
  public.family_create_invite(), public.family_join(text), public.family_summary(), public.family_mine(), public.family_unlink(text),
  public.admin_create_school(text, int, timestamptz), public.admin_create_code(text, text, int, int, text, uuid, text),
  public.admin_set_member(uuid, text, text), public.admin_grant_plan(text, text, int), public.admin_revoke_plan(text), public.admin_overview()
  from public, anon;
grant execute on function
  public.my_school(), public.school_panel(), public.school_create_code(text, text, int, int), public.school_list_codes(),
  public.family_create_invite(), public.family_join(text), public.family_summary(), public.family_mine(), public.family_unlink(text),
  public.admin_create_school(text, int, timestamptz), public.admin_create_code(text, text, int, int, text, uuid, text),
  public.admin_set_member(uuid, text, text), public.admin_grant_plan(text, text, int), public.admin_revoke_plan(text), public.admin_overview()
  to authenticated;
