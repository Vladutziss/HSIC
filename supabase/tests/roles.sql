-- Role checks (migration 0042): school roles, seats, k-anonymity of the class panel, one school per account, plan end,
-- family links, admin functions, RLS. Plain SQL in one transaction that is rolled back (SQL editor or psql -f).
-- Raises an exception naming the first failure; success ends with NOTICE 'role checks passed'. Needs 0041 and 0042.
-- To try 0042 without applying it, paste 0042_roles.sql between the first `begin;` and the helper functions below.

begin;

create function public._t_as(sub text, em text default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', sub, 'role', 'authenticated', 'email', em)::text, true);
  set local role authenticated;
end $$;
create function public._t_err(q text) returns text language plpgsql as $$
begin
  execute q;
  return null;
exception when others then return sqlerrm;
end $$;
create function public._t_denied(q text) returns boolean language plpgsql as $$
begin
  execute q;
  return false;
exception when insufficient_privilege then return true;
end $$;

insert into public.site_admins (email) values ('admin@molted.test');
insert into public.profiles (id, name, onboarded) values
  ('u_sadmin', 'Site Admin', true), ('u_adm', 'Admin Scoala', true), ('u_tea', 'Diriginte', true),
  ('u_s1', 'Elev Unu', true), ('u_s2', 'Elev Doi', true), ('u_s3', 'Elev Trei', true), ('u_s4', 'Elev Patru', true),
  ('u_s5', 'Elev Cinci', true), ('u_s6', 'Elev Sase', true), ('u_par', 'Parinte', true), ('u_out', 'Outsider', true);
insert into public.habits (id, user_id, name) values ('h1', 'u_s1', 'a'), ('h2', 'u_s2', 'b');
insert into public.completions (user_id, habit_id, day, code) values
  ('u_s1', 'h1', current_date, 1), ('u_s1', 'h1', current_date - 1, 1), ('u_s2', 'h2', current_date, 1), ('u_s2', 'h2', current_date - 30, 1);

do $$
declare
  sid uuid;
  sid2 uuid;
  r record;
  n int;
  v text;
  code1 text;
  adm constant text := 'admin@molted.test';
begin
  -- ---- only site admins reach the admin functions
  perform public._t_as('u_out');
  if public._t_err($q$select public.admin_create_school('X', 5, now() + interval '1 year')$q$) is distinct from 'forbidden' then
    raise exception 'a non-admin created a school';
  end if;
  if public._t_err($q$select public.admin_overview()$q$) is distinct from 'forbidden' then raise exception 'a non-admin read the overview'; end if;
  reset role;

  -- ---- a site admin makes a school with 6 seats, codes, and its first admin
  perform public._t_as('u_sadmin', adm);
  sid := public.admin_create_school('Liceul X', 6, now() + interval '1 year');
  perform public.admin_create_code('LICEU-STU', 'school', 90, 6, 'elevi', sid, 'student');
  perform public.admin_create_code('LICEU-TEA', 'school', 90, 2, 'diriginti', sid, 'teacher');
  perform public.admin_set_member(sid, 'u_adm', 'admin');
  select count(*) into n from jsonb_array_elements(public.admin_overview() -> 'schools');
  if n <> 1 then raise exception 'overview does not list the school'; end if;
  reset role;

  -- ---- the school admin has the school plan and the admin role
  perform public._t_as('u_adm');
  select * into r from public.my_plan();
  if r.plan <> 'school' then raise exception 'the school admin does not have the school plan'; end if;
  select * into r from public.my_school();
  if r.role <> 'admin' or r.seats <> 6 then raise exception 'my_school is wrong for the admin'; end if;

  -- ---- a teacher joins with a teacher code; the panel is hidden below 5 students
  perform public._t_as('u_tea');
  select * into r from public.redeem_plan_code('LICEU-TEA');
  if r.plan is distinct from 'school' then raise exception 'teacher code did not work'; end if;
  select * into r from public.my_school();
  if r.role <> 'teacher' then raise exception 'teacher role not set'; end if;
  for i in 1..4 loop
    perform public._t_as('u_s' || i);
    select * into r from public.redeem_plan_code('LICEU-STU');
    if r.plan is distinct from 'school' then raise exception 'student code failed for %', i; end if;
  end loop;
  perform public._t_as('u_tea');
  select * into r from public.school_panel();
  if r.hidden is not true or r.active7 is not null or r.checkins7 is not null or r.students <> 4 then
    raise exception 'the panel must be hidden below 5 students (students=%, hidden=%)', r.students, r.hidden;
  end if;
  -- the fifth student makes the numbers visible; they are counts only
  perform public._t_as('u_s5');
  select * into r from public.redeem_plan_code('LICEU-STU');
  perform public._t_as('u_tea');
  select * into r from public.school_panel();
  if r.hidden is not false or r.students <> 5 or r.active7 <> 2 or r.checkins7 <> 3 then
    raise exception 'panel numbers wrong: students=%, active7=%, checkins7=%', r.students, r.active7, r.checkins7;
  end if;

  -- ---- students see no panel, cannot make codes, and see only themselves
  perform public._t_as('u_s1');
  if exists (select 1 from public.school_panel()) then raise exception 'LEAK: a student sees the class panel'; end if;
  if public._t_err($q$select public.school_create_code('x', 'student', 1, 30)$q$) is distinct from 'not a school admin' then
    raise exception 'a student made a school code';
  end if;
  select count(*) into n from public.school_members;
  if n <> 1 then raise exception 'LEAK: a student sees % membership rows', n; end if;
  if not public._t_denied($q$insert into public.school_members (school_id, user_id, role) values (null, 'u_s1', 'admin')$q$) then
    raise exception 'a student wrote school_members';
  end if;
  if exists (select 1 from public.school_list_codes()) then raise exception 'LEAK: a student lists codes'; end if;

  -- ---- seats: 6 seats, one student code of 6 uses; the sixth works, the seventh finds the code used up
  perform public._t_as('u_s6');
  select * into r from public.redeem_plan_code('LICEU-STU');
  if r.plan is distinct from 'school' then raise exception 'sixth student failed'; end if;
  perform public._t_as('u_out');
  if exists (select 1 from public.redeem_plan_code('LICEU-STU')) then raise exception 'a code went over its uses'; end if;
  -- the admin cannot create a student code beyond the seats
  perform public._t_as('u_adm');
  if public._t_err($q$select public.school_create_code('extra', 'student', 1, 30)$q$) is distinct from 'not enough seats' then
    raise exception 'seats not enforced';
  end if;
  -- but can create a teacher code, and lists it
  code1 := public.school_create_code('diriginte 2', 'teacher', 1, 30);
  if code1 !~ '^SCH-[A-Z0-9]{12}$' then raise exception 'bad generated code %', code1; end if;
  select count(*) into n from public.school_list_codes();
  if n <> 3 then raise exception 'school_list_codes returned % rows', n; end if;
  reset role;

  -- ---- one school per account, and the plan never outlives the contract
  perform public._t_as('u_sadmin', adm);
  sid2 := public.admin_create_school('Liceul Y', 5, now() + interval '10 days');
  perform public.admin_create_code('LICEU-Y', 'school', 90, 5, 'y', sid2, 'student');
  perform public._t_as('u_s1');
  if exists (select 1 from public.redeem_plan_code('LICEU-Y')) then raise exception 'an account joined a second school'; end if;
  perform public._t_as('u_out');
  select * into r from public.redeem_plan_code('LICEU-Y');
  if r.until is null or r.until > now() + interval '11 days' then raise exception 'plan outlives the contract: %', r.until; end if;
  reset role;

  -- ---- family: the student creates an invite, the parent joins, sees two numbers, either side can unlink
  perform public._t_as('u_s1');
  v := public.family_create_invite();
  if v !~ '^[A-Z0-9]{8}$' then raise exception 'bad invite %', v; end if;
  if public.family_join(v) is not null then raise exception 'an account joined its own invite'; end if;
  perform public._t_as('u_par');
  if public.family_join(v) is distinct from 'Elev Unu' then raise exception 'the parent could not join'; end if;
  if public.family_join(v) is not null then raise exception 'an invite was used twice'; end if;
  select * into r from public.family_summary();
  if r.student_name <> 'Elev Unu' or r.active_days7 <> 2 or r.checkins7 <> 2 then
    raise exception 'family summary wrong: %, %, %', r.student_name, r.active_days7, r.checkins7;
  end if;
  -- the parent sees nothing of other students, and no raw tables beyond their own link
  select count(*) into n from public.family_summary();
  if n <> 1 then raise exception 'LEAK: parent sees % students', n; end if;
  if public._t_err($q$select * from public.family_invites$q$) is null then raise exception 'LEAK: invites readable'; end if;
  perform public._t_as('u_out');
  select count(*) into n from public.family_links;
  if n <> 0 then raise exception 'LEAK: outsider sees family links'; end if;
  if exists (select 1 from public.family_summary()) then raise exception 'LEAK: outsider has a family summary'; end if;
  -- the student can unlink; after that the parent sees nothing
  perform public._t_as('u_s1');
  select count(*) into n from public.family_mine();
  if n <> 1 then raise exception 'the student does not see the parent link'; end if;
  perform public.family_unlink('u_par');
  perform public._t_as('u_par');
  if exists (select 1 from public.family_summary()) then raise exception 'the parent still sees the student after unlink'; end if;
  reset role;

  -- ---- an admin can take a plan back; deleting an account clears roles and links
  perform public._t_as('u_sadmin', adm);
  perform public.admin_grant_plan('u_out', 'pro', 30);
  perform public._t_as('u_out');
  select * into r from public.my_plan();
  if r.plan <> 'pro' then raise exception 'admin_grant_plan did not give pro'; end if;
  perform public._t_as('u_sadmin', adm);
  perform public.admin_revoke_plan('u_out');
  perform public._t_as('u_out');
  select * into r from public.my_plan();
  if r.plan <> 'free' then raise exception 'admin_revoke_plan did not take it back'; end if;
  perform public.delete_my_account();
  reset role;
  select count(*) into n from public.school_members where user_id = 'u_out';
  if n <> 0 then raise exception 'membership survived account deletion'; end if;

  raise notice 'role checks passed';
end $$;

rollback;
