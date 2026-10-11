-- Web Push: one row per browser/device that agreed to notifications.
-- * The browser's endpoint + keys come from PushManager.subscribe(); the row also carries the device's time
--   zone and the user's report time, so the server can find who is due without reading anything else.
-- * Clients never write the table: they call save_push_subscription / remove_push_subscription (a phone that
--   changes hands moves the subscription to whoever is signed in now).
-- * Sending is done by the `push` Edge Function with the service role: due_report_pushes() hands it the
--   devices to notify and marks them, so a report push goes out once per local day.
-- * pg_cron calls the function every minute. `tick` is idempotent and takes no input, so it needs no secret.

create table public.push_subscriptions (
  endpoint text primary key,
  user_id text not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  tz text not null default 'UTC',
  report_time time not null default '21:00',
  daily_report boolean not null default true,
  group_nudges boolean not null default true,
  last_report_on date,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = (select public.requesting_user_id()));
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;

create function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_tz text, p_report_time text, p_daily boolean, p_nudges boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  zone text := case when exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_tz) then p_tz else 'UTC' end;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'bad endpoint'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, tz, report_time, daily_report, group_nudges)
  values (p_endpoint, me, p_p256dh, p_auth, zone, p_report_time::time, p_daily, p_nudges)
  on conflict (endpoint) do update
  set user_id = me, p256dh = excluded.p256dh, auth = excluded.auth, tz = excluded.tz,
      report_time = excluded.report_time, daily_report = excluded.daily_report, group_nudges = excluded.group_nudges;
end $$;

create function public.remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = (select public.requesting_user_id());
$$;

revoke execute on function public.save_push_subscription(text, text, text, text, text, boolean, boolean) from public, anon;
revoke execute on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- devices whose report time has passed today (their local day), within a 2 h window, and whose user has no
-- report for that day yet. Marks them, so the next tick skips them.
create function public.due_report_pushes()
returns table (endpoint text, p256dh text, auth text)
language sql security definer set search_path = '' as $$
  with due as (
    select s.endpoint, (now() at time zone s.tz)::date as local_day
    from public.push_subscriptions s
    where s.daily_report
      and extract(epoch from ((now() at time zone s.tz)::time - s.report_time)) between 0 and 7200
      and s.last_report_on is distinct from (now() at time zone s.tz)::date
  ), marked as (
    update public.push_subscriptions s set last_report_on = d.local_day
    from due d where s.endpoint = d.endpoint
    returning s.endpoint, s.p256dh, s.auth, s.user_id, d.local_day
  )
  select m.endpoint, m.p256dh, m.auth from marked m
  where not exists (select 1 from public.day_reviews r where r.user_id = m.user_id and r.day = m.local_day);
$$;
revoke execute on function public.due_report_pushes() from public, anon, authenticated;
grant execute on function public.due_report_pushes() to service_role;

-- every minute: ask the `push` function to send what is due
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'push-daily-report',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://ldggxdgrmlhcfoherdlu.supabase.co/functions/v1/push',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{"action": "tick"}'::jsonb
     ) $$
);
