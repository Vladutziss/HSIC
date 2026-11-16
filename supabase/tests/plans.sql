-- Plan checks (migration 0041): free by default, codes, one redemption per account, expiry, quota factors, RLS.
-- Plain SQL in one transaction that is rolled back (SQL editor or psql -f). Raises an exception naming the first
-- failure; success ends with NOTICE 'plan checks passed'. Needs 0041 applied.

begin;

create function public._t_as(sub text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', sub, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function public._t_denied(q text) returns boolean language plpgsql as $$
begin
  execute q;
  return false;
exception when insufficient_privilege then return true;
end $$;

insert into public.profiles (id, name, onboarded) values ('user_aaa', 'Ana', true), ('user_bbb', 'Bob', true), ('user_ccc', 'Cris', true);
insert into public.plan_codes (code, plan, days, max_uses, label) values
  ('PRO-ONE', 'pro', 30, 1, 'test'), ('SCHOOL-TWO', 'school', 365, 2, 'test'), ('OLD-CODE', 'pro', 30, 5, 'test');
update public.plan_codes set expires_at = now() - interval '1 day' where code = 'OLD-CODE';

do $$
declare
  r record;
  n int;
  ok boolean;
begin
  -- ---- free by default
  perform public._t_as('user_aaa');
  select * into r from public.my_plan();
  if r.plan <> 'free' or r.until is not null then raise exception 'a new account must be free'; end if;

  -- ---- unknown, expired and malformed codes grant nothing
  if exists (select 1 from public.redeem_plan_code('NOPE-NOPE')) then raise exception 'an unknown code was accepted'; end if;
  if exists (select 1 from public.redeem_plan_code('OLD-CODE')) then raise exception 'an expired code was accepted'; end if;
  select * into r from public.my_plan();
  if r.plan <> 'free' then raise exception 'a rejected code changed the plan'; end if;

  -- ---- a good code (case and spaces do not matter) grants the plan until now + days
  select * into r from public.redeem_plan_code('  pro-one ');
  if r.plan is distinct from 'pro' or r.until < now() + interval '29 days' or r.until > now() + interval '31 days' then
    raise exception 'redeeming PRO-ONE did not give 30 days of pro';
  end if;
  select * into r from public.my_plan();
  if r.plan <> 'pro' then raise exception 'my_plan does not show pro after redeeming'; end if;

  -- ---- the same account cannot use the same code twice, and a used-up code is refused for others
  if exists (select 1 from public.redeem_plan_code('PRO-ONE')) then raise exception 'the same account redeemed a code twice'; end if;
  perform public._t_as('user_bbb');
  if exists (select 1 from public.redeem_plan_code('PRO-ONE')) then raise exception 'a used-up code was accepted'; end if;

  -- ---- a code with two uses works for two accounts and not a third
  perform public._t_as('user_bbb');
  select * into r from public.redeem_plan_code('SCHOOL-TWO');
  if r.plan is distinct from 'school' then raise exception 'SCHOOL-TWO did not give the school plan'; end if;
  perform public._t_as('user_aaa');
  select * into r from public.redeem_plan_code('SCHOOL-TWO');
  if r.plan is distinct from 'school' then raise exception 'a second account could not use SCHOOL-TWO'; end if;
  perform public._t_as('user_ccc');
  if exists (select 1 from public.redeem_plan_code('SCHOOL-TWO')) then raise exception 'a code went over max_uses'; end if;

  -- ---- RLS: own row only, no direct writes, codes unreadable
  perform public._t_as('user_aaa');
  select count(*) into n from public.user_plans;
  if n <> 1 then raise exception 'LEAK: an account sees % plan rows', n; end if;
  if not public._t_denied($q$insert into public.user_plans (user_id, plan, until) values ('user_aaa', 'school', now() + interval '1000 days')$q$) then
    raise exception 'an account wrote its own plan';
  end if;
  if not public._t_denied($q$update public.user_plans set until = now() + interval '1000 days'$q$) then raise exception 'an account extended its own plan'; end if;
  if not public._t_denied($q$select * from public.plan_codes$q$) then raise exception 'LEAK: codes are readable'; end if;
  if not public._t_denied($q$select * from public.plan_code_redemptions$q$) then raise exception 'LEAK: redemptions are readable'; end if;
  reset role;

  -- ---- a plan that ended counts as free
  update public.user_plans set until = now() - interval '1 minute' where user_id = 'user_aaa';
  perform public._t_as('user_aaa');
  select * into r from public.my_plan();
  if r.plan <> 'free' then raise exception 'an ended plan still counts'; end if;

  -- ---- the daily AI limit scales with the plan: free 1x, pro 3x, school 2x
  -- user_aaa is free again: limit 2 -> third call refused
  ok := public.bump_ai_usage(2) and public.bump_ai_usage(2);
  if not ok or public.bump_ai_usage(2) then raise exception 'free limit is not 1x'; end if;
  -- user_bbb has school: limit 2 -> 4 calls pass, the fifth does not
  perform public._t_as('user_bbb');
  ok := true;
  for i in 1..4 loop ok := ok and public.bump_ai_usage(2); end loop;
  if not ok or public.bump_ai_usage(2) then raise exception 'school limit is not 2x'; end if;
  -- pro: limit 2 -> 6 calls
  reset role;
  update public.user_plans set plan = 'pro', until = now() + interval '5 days' where user_id = 'user_bbb';
  delete from public.ai_usage where user_id = 'user_bbb';
  perform public._t_as('user_bbb');
  ok := true;
  for i in 1..6 loop ok := ok and public.bump_ai_usage(2); end loop;
  if not ok or public.bump_ai_usage(2) then raise exception 'pro limit is not 3x'; end if;
  reset role;

  -- ---- deleting an account clears its plan data
  perform public._t_as('user_bbb');
  perform public.delete_my_account();
  reset role;
  select count(*) into n from public.user_plans where user_id = 'user_bbb';
  if n <> 0 then raise exception 'plan survived account deletion'; end if;
  select count(*) into n from public.plan_code_redemptions where user_id = 'user_bbb';
  if n <> 0 then raise exception 'redemption survived account deletion'; end if;

  raise notice 'plan checks passed';
end $$;

rollback;
