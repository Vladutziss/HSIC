-- Push notifications belong to the account, not to the device.
-- * The choices (daily report on/off, group reminders on/off, report time) are read from profiles.settings
--   (pushReport, pushNudges, reviewTime) at send time, so a change made on any device applies to all of them.
--   The copies on push_subscriptions (daily_report, group_nudges, report_time) stay only as unused leftovers.
-- * A device row keeps what is really the device's: endpoint, keys and time zone.
-- * profiles.settings.pushOn says the account wants notifications; a signed-in device that already has the
--   browser permission subscribes itself (see apps/app/src/lib/push.js: ensurePush).

create function public.push_pref_bool(s jsonb, k text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(case jsonb_typeof(s -> k) when 'boolean' then (s ->> k)::boolean end, true);
$$;

create function public.push_report_time(s jsonb) returns time
language sql immutable set search_path = '' as $$
  select case when s ->> 'reviewTime' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then (s ->> 'reviewTime')::time else '21:00'::time end;
$$;

revoke execute on function public.push_pref_bool(jsonb, text), public.push_report_time(jsonb) from public, anon, authenticated;
grant execute on function public.push_pref_bool(jsonb, text), public.push_report_time(jsonb) to service_role;

-- same contract as before (endpoint, p256dh, auth), but who is due now comes from the account's settings
create or replace function public.due_report_pushes()
returns table (endpoint text, p256dh text, auth text)
language sql security definer set search_path = '' as $$
  with due as (
    select s.endpoint, (now() at time zone s.tz)::date as local_day
    from public.push_subscriptions s
    join public.profiles p on p.id = s.user_id
    where public.push_pref_bool(p.settings, 'pushReport')
      and extract(epoch from ((now() at time zone s.tz)::time - public.push_report_time(p.settings))) between 0 and 7200
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

-- the device only reports itself now; the old signature stays so a cached older client keeps working
create function public.save_push_device(p_endpoint text, p_p256dh text, p_auth text, p_tz text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  zone text := case when exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_tz) then p_tz else 'UTC' end;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'bad endpoint'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, tz)
  values (p_endpoint, me, p_p256dh, p_auth, zone)
  on conflict (endpoint) do update
  set user_id = me, p256dh = excluded.p256dh, auth = excluded.auth, tz = excluded.tz;
end $$;
revoke execute on function public.save_push_device(text, text, text, text) from public, anon;
grant execute on function public.save_push_device(text, text, text, text) to authenticated;

-- accounts that already have a device subscribed are marked as wanting notifications
update public.profiles p
set settings = coalesce(p.settings, '{}'::jsonb) || '{"pushOn": true}'::jsonb
where exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
  and coalesce(p.settings ->> 'pushOn', '') = '';

-- turning notifications off for the account removes every device of it
create function public.remove_my_push_subscriptions() returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where user_id = (select public.requesting_user_id());
$$;
revoke execute on function public.remove_my_push_subscriptions() from public, anon;
grant execute on function public.remove_my_push_subscriptions() to authenticated;
