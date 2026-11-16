-- Plans without a payment provider.
-- Free is the default and needs no row. Pro and School are granted per account, with an end date, in two ways:
--   * the account redeems a code (redeem_plan_code), made by a site admin after a bank transfer, a school contract
--     or a sponsor deal;
--   * an admin inserts the grant by hand in the SQL editor (examples below).
-- The only thing a plan changes in the database is the daily AI quota: bump_ai_usage() multiplies the limit the Edge
-- Function passes (ai: 40, agent: 15) by the plan's factor, so no function needs a redeploy. Factors: free 1, pro 3,
-- school 2. They are mirrored in apps/app/src/lib/plan.js and kept equal by tests/plan.test.mjs.
--
--   Make a code (200 students of a school, 1 year):
--     insert into public.plan_codes (code, plan, days, max_uses, label) values ('LICEUL-X-2027', 'school', 365, 200, 'Liceul X');
--   Give Pro to one account for 30 days (Clerk user id):
--     insert into public.user_plans (user_id, plan, until, source) values ('user_abc', 'pro', now() + interval '30 days', 'transfer')
--     on conflict (user_id) do update set plan = excluded.plan, until = excluded.until, source = excluded.source;
--   Take it back:  delete from public.user_plans where user_id = 'user_abc';

create table public.plan_codes (
  code text primary key check (code = upper(code) and code ~ '^[A-Z0-9-]{4,40}$'),
  plan text not null check (plan in ('pro', 'school')),
  days int not null check (days between 1 and 800),
  max_uses int not null default 1 check (max_uses between 1 and 5000),
  uses int not null default 0 check (uses >= 0),
  expires_at timestamptz, -- last moment the code can be redeemed (null: no deadline)
  label text not null default '' check (char_length(label) <= 80),
  created_at timestamptz not null default now()
);
alter table public.plan_codes enable row level security;
revoke all on public.plan_codes from anon, authenticated; -- nobody reads codes through the API; admins use the SQL editor
grant all on public.plan_codes to service_role;

create table public.user_plans (
  user_id text primary key references public.profiles (id) on delete cascade,
  plan text not null check (plan in ('pro', 'school')),
  until timestamptz not null,
  source text not null default 'code' check (char_length(source) <= 40),
  created_at timestamptz not null default now()
);
alter table public.user_plans enable row level security;
create policy user_plans_select on public.user_plans for select to authenticated using (user_id = (select public.requesting_user_id()));
revoke all on public.user_plans from anon, authenticated;
grant select on public.user_plans to authenticated; -- writes only through redeem_plan_code() or the SQL editor
grant all on public.user_plans to service_role;

-- one redemption of a code per account (a second try does nothing, so a code cannot be stacked by one person)
create table public.plan_code_redemptions (
  code text not null references public.plan_codes (code) on delete cascade,
  user_id text not null references public.profiles (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, user_id)
);
alter table public.plan_code_redemptions enable row level security;
revoke all on public.plan_code_redemptions from anon, authenticated;
grant all on public.plan_code_redemptions to service_role;

-- the caller's plan right now: 'free' when there is no grant or it has ended
create function public.my_plan() returns table (plan text, until timestamptz)
language sql stable security definer set search_path = '' as $$
  select coalesce(p.plan, 'free'), p.until
  from (select 1) x
  left join public.user_plans p on p.user_id = (select public.requesting_user_id()) and p.until > now();
$$;

-- returns the plan granted, or null when the code is unknown, used up, expired or already used by this account
create function public.redeem_plan_code(p_code text) returns table (plan text, until timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  c public.plan_codes%rowtype;
  base timestamptz;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into c from public.plan_codes where code = upper(trim(p_code)) for update;
  if not found or c.uses >= c.max_uses or (c.expires_at is not null and c.expires_at < now()) then return; end if;
  insert into public.plan_code_redemptions (code, user_id) values (c.code, me) on conflict do nothing;
  if not found then return; end if;
  update public.plan_codes set uses = uses + 1 where code = c.code;
  -- extend from the current end date when the same plan is still running, otherwise start now
  select case when up.plan = c.plan and up.until > now() then up.until else now() end into base
  from (select 1) x left join public.user_plans up on up.user_id = me;
  base := coalesce(base, now());
  insert into public.user_plans as u (user_id, plan, until, source) values (me, c.plan, base + make_interval(days => c.days), 'code')
  on conflict (user_id) do update set plan = excluded.plan, until = excluded.until, source = 'code';
  return query select up.plan, up.until from public.user_plans up where up.user_id = me;
end $$;

-- the daily AI limit grows with the plan; same signature and return value as before
create or replace function public.bump_ai_usage(daily_max int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  used int;
  factor int;
begin
  if me is null then return false; end if;
  select case p.plan when 'pro' then 3 when 'school' then 2 else 1 end into factor
  from (select 1) x left join public.user_plans p on p.user_id = me and p.until > now();
  insert into public.ai_usage as u (user_id, day, count) values (me, current_date, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count into used;
  return used <= daily_max * coalesce(factor, 1);
end $$;

revoke execute on function public.my_plan(), public.redeem_plan_code(text) from public, anon;
grant execute on function public.my_plan(), public.redeem_plan_code(text) to authenticated;
