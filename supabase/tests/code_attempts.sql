-- Guessing limit (migration 0043): 10 failed tries per hour per account for plan codes and family invites; admin codes
-- are at least 8 characters, or generated. Plain SQL in one transaction that is rolled back; raises an exception naming
-- the first failure; success ends with NOTICE 'attempt checks passed'. Needs 0041, 0042 and 0043.

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

insert into public.site_admins (email) values ('admin@molted.test');
insert into public.profiles (id, name, onboarded) values ('u_a', 'A', true), ('u_b', 'B', true), ('u_c', 'C', true), ('u_adm', 'Adm', true);
insert into public.plan_codes (code, plan, days, max_uses, label) values ('REAL-CODE-1', 'pro', 30, 5, 'test');

do $$
declare
  r record;
  v text;
  n int;
begin
  -- ---- ten wrong tries are answered "nothing"; the eleventh is refused, even with a valid code
  perform public._t_as('u_a');
  for i in 1..10 loop
    if exists (select 1 from public.redeem_plan_code('WRONG-' || i)) then raise exception 'a wrong code was accepted'; end if;
  end loop;
  if public._t_err($q$select * from public.redeem_plan_code('REAL-CODE-1')$q$) is distinct from 'too_many_attempts' then
    raise exception 'the 11th try was not refused';
  end if;
  select * into r from public.my_plan();
  if r.plan <> 'free' then raise exception 'a locked-out account got a plan'; end if;

  -- ---- other accounts are not affected, and a valid code works for them
  perform public._t_as('u_b');
  select * into r from public.redeem_plan_code('REAL-CODE-1');
  if r.plan is distinct from 'pro' then raise exception 'another account was locked out'; end if;

  -- ---- an old failure stops counting after the hour
  reset role;
  update public.code_attempts set at = now() - interval '2 hours' where user_id = 'u_a';
  perform public._t_as('u_a');
  select * into r from public.redeem_plan_code('REAL-CODE-1');
  if r.plan is distinct from 'pro' then raise exception 'the lock did not expire'; end if;

  -- ---- family invites have the same limit
  perform public._t_as('u_c');
  for i in 1..10 loop
    if public.family_join('NOPE' || lpad(i::text, 4, '0')) is not null then raise exception 'a wrong invite was accepted'; end if;
  end loop;
  if public._t_err($q$select public.family_join('NOPE0000')$q$) is distinct from 'too_many_attempts' then
    raise exception 'family_join is not limited';
  end if;

  -- ---- the failure rows are not readable by accounts
  if public._t_err($q$select * from public.code_attempts$q$) is null then raise exception 'LEAK: attempts readable'; end if;
  reset role;

  -- ---- admin codes: too short is refused, blank is generated, a normal one is kept
  perform public._t_as('u_adm', 'admin@molted.test');
  if public._t_err($q$select public.admin_create_code('SHORT', 'pro', 30, 1, 'x')$q$) is distinct from 'code too short' then
    raise exception 'a short admin code was accepted';
  end if;
  v := public.admin_create_code('', 'pro', 30, 1, 'x');
  if v !~ '^MLT-[A-Z0-9]{12}$' then raise exception 'bad generated code %', v; end if;
  if public.admin_create_code('  my-code-123 ', 'pro', 30, 1, 'x') <> 'MY-CODE-123' then raise exception 'admin code not normalised'; end if;
  reset role;

  raise notice 'attempt checks passed';
end $$;

rollback;
