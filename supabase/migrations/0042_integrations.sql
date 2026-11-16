-- Integrations: a calendar feed (.ics), outgoing webhooks, Notion, and tokens for the MCP server.
-- Design, deploy order and secrets: docs/INTEGRATIONS.md. The Edge Functions are `calendar`, `webhooks`, `notion`, `mcp`.
--
-- What the database decides, so no function has to be trusted with it:
--   * who owns a calendar link or an MCP token (the functions only get a user id back from a lookup);
--   * which events exist and who is told about them: triggers on completions / agent_actions / day_reviews /
--     reflections put one row per receiver into integration_events (an outbox), and the `webhooks` function only
--     delivers what is there. An integration can never block the write that caused it (the triggers swallow errors);
--   * retries and switching off a dead address (record_integration_result).
-- Clients never write these tables: they read their own rows (RLS) and change them through the functions below.
-- The Notion access token and the hashes of MCP tokens are not readable through the API at all.
--
-- Undo (also forgets every link, address and token, so only on a database nobody has used yet):
--   drop trigger if exists completions_integration_event on public.completions;
--   drop trigger if exists agent_actions_integration_event on public.agent_actions;
--   drop trigger if exists day_reviews_integration_event on public.day_reviews;
--   drop trigger if exists reflections_integration_event on public.reflections;
--   drop function if exists public.trg_integration_event(), public.integration_enqueue(text, text, jsonb),
--     public.claim_integration_events(int), public.record_integration_result(uuid, boolean, int, text),
--     public.save_calendar_feed(text, boolean, boolean), public.remove_calendar_feed(), public.calendar_feed_owner(text),
--     public.create_webhook_endpoint(text, text[]), public.update_webhook_endpoint(uuid, text[], boolean),
--     public.delete_webhook_endpoint(uuid), public.my_notion_connection(), public.set_notion_auto_sync(boolean),
--     public.create_mcp_token(text, boolean, text), public.revoke_mcp_token(uuid), public.mcp_token_owner(text);
--   drop table if exists public.integration_events, public.webhook_endpoints, public.calendar_feeds,
--     public.notion_pages, public.notion_connections, public.mcp_tokens;

-- 64 hex characters from two random UUIDs (the same recipe as the unsubscribe token in 0032)
create function public.integration_secret() returns text
language sql volatile set search_path = '' as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;
revoke execute on function public.integration_secret() from public, anon, authenticated;
grant execute on function public.integration_secret() to service_role;

-- a time zone the server knows, or the app's home zone
create function public.integration_tz(p_tz text) returns text
language sql stable set search_path = '' as $$
  select case when exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_tz) then p_tz else 'Europe/Bucharest' end;
$$;
revoke execute on function public.integration_tz(text) from public, anon, authenticated;
grant execute on function public.integration_tz(text) to service_role;

-- ============================================================ 1. calendar feed
-- One secret link per account. Calendar apps cannot send a header, so the token in the address is the credential:
-- it only ever reads, and the owner can replace it (the old link stops working at once) or remove it.
create table public.calendar_feeds (
  user_id text primary key references public.profiles (id) on delete cascade,
  token text not null unique default public.integration_secret(),
  tz text not null default 'Europe/Bucharest', -- the owner's time zone: to-do times are local wall-clock times
  habits boolean not null default false, -- also list habits that have a time
  created_at timestamptz not null default now(),
  last_fetched_at timestamptz
);
alter table public.calendar_feeds enable row level security;
create policy calendar_feeds_select on public.calendar_feeds for select to authenticated
  using (user_id = (select public.requesting_user_id()));
revoke all on public.calendar_feeds from anon, authenticated;
grant select on public.calendar_feeds to authenticated;
grant all on public.calendar_feeds to service_role;

-- turns the link on, changes its options, or (p_rotate) replaces the token
create function public.save_calendar_feed(p_tz text, p_habits boolean default false, p_rotate boolean default false)
returns table (token text, tz text, habits boolean)
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
begin
  if me is null then raise exception 'not authenticated'; end if;
  insert into public.calendar_feeds as f (user_id, tz, habits)
  values (me, public.integration_tz(p_tz), coalesce(p_habits, false))
  on conflict (user_id) do update
  set tz = excluded.tz,
      habits = excluded.habits,
      token = case when p_rotate then public.integration_secret() else f.token end,
      created_at = case when p_rotate then now() else f.created_at end,
      last_fetched_at = case when p_rotate then null else f.last_fetched_at end;
  return query select f.token, f.tz, f.habits from public.calendar_feeds f where f.user_id = me;
end $$;

create function public.remove_calendar_feed() returns void
language sql security definer set search_path = '' as $$
  delete from public.calendar_feeds where user_id = (select public.requesting_user_id());
$$;

-- for the `calendar` function: whose link this is (and notes the visit, at most once a minute)
create function public.calendar_feed_owner(p_token text)
returns table (user_id text, tz text, habits boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return; end if;
  update public.calendar_feeds f set last_fetched_at = now()
  where f.token = p_token and (f.last_fetched_at is null or f.last_fetched_at < now() - interval '1 minute');
  return query select f.user_id, f.tz, f.habits from public.calendar_feeds f where f.token = p_token;
end $$;

revoke execute on function public.save_calendar_feed(text, boolean, boolean), public.remove_calendar_feed(), public.calendar_feed_owner(text) from public, anon, authenticated;
grant execute on function public.save_calendar_feed(text, boolean, boolean), public.remove_calendar_feed() to authenticated;
grant execute on function public.calendar_feed_owner(text) to service_role;

-- ============================================================ 2. outgoing webhooks
-- An address the player chose (their own server, Zapier, Make, n8n) that is told when something happens.
-- `secret` signs every delivery (HMAC-SHA256, the Standard Webhooks scheme); the owner reads it to check signatures.
create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (id) on delete cascade,
  url text not null check (char_length(url) <= 500 and url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]]*)?$'),
  secret text not null,
  events text[] not null check (
    cardinality(events) between 1 and 4
    and events <@ array['habit.checked', 'plan.applied', 'report.created', 'reflection.created']
  ),
  active boolean not null default true,
  failures int not null default 0, -- deliveries failed in a row; at 20 the address is switched off
  disabled_reason text check (disabled_reason in ('failures')),
  last_status int,
  last_error text,
  last_delivery_at timestamptz,
  last_test_at timestamptz,
  created_at timestamptz not null default now()
);
create index webhook_endpoints_user on public.webhook_endpoints (user_id);
alter table public.webhook_endpoints enable row level security;
create policy webhook_endpoints_select on public.webhook_endpoints for select to authenticated
  using (user_id = (select public.requesting_user_id()));
revoke all on public.webhook_endpoints from anon, authenticated;
grant select on public.webhook_endpoints to authenticated;
grant all on public.webhook_endpoints to service_role;

create function public.create_webhook_endpoint(p_url text, p_events text[])
returns setof public.webhook_endpoints
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  made public.webhook_endpoints%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  -- the per-account limit is checked under a lock on the profile row, so two quick taps cannot both pass
  perform 1 from public.profiles p where p.id = me for update;
  if (select count(*) from public.webhook_endpoints e where e.user_id = me) >= 3 then
    raise exception 'webhook limit reached' using errcode = 'P0001';
  end if;
  insert into public.webhook_endpoints (user_id, url, secret, events)
  values (
    me, trim(p_url),
    -- "whsec_" + base64 of 32 random bytes: the secret format of the Standard Webhooks libraries
    'whsec_' || encode(decode(public.integration_secret(), 'hex'), 'base64'),
    (select array_agg(distinct e) from unnest(p_events) e)
  )
  returning * into made;
  return next made;
end $$;

-- change what an address hears about, pause it or switch it back on (which also forgives its failures)
create function public.update_webhook_endpoint(p_id uuid, p_events text[] default null, p_active boolean default null)
returns setof public.webhook_endpoints
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
  update public.webhook_endpoints e
  set events = coalesce((select array_agg(distinct x) from unnest(p_events) x), e.events),
      active = coalesce(p_active, e.active),
      failures = case when p_active then 0 else e.failures end,
      disabled_reason = case when p_active then null else e.disabled_reason end
  where e.id = p_id and e.user_id = me
  returning e.*;
end $$;

create function public.delete_webhook_endpoint(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.webhook_endpoints where id = p_id and user_id = (select public.requesting_user_id());
$$;

revoke execute on function public.create_webhook_endpoint(text, text[]), public.update_webhook_endpoint(uuid, text[], boolean), public.delete_webhook_endpoint(uuid) from public, anon;
grant execute on function public.create_webhook_endpoint(text, text[]), public.update_webhook_endpoint(uuid, text[], boolean), public.delete_webhook_endpoint(uuid) to authenticated;

-- ============================================================ 3. Notion
-- One workspace per account. `access_token` is stored encrypted by the `notion` function (AES-GCM, key in the
-- function's secrets) and no API role can read the table; the app sees only my_notion_connection().
create table public.notion_connections (
  user_id text primary key references public.profiles (id) on delete cascade,
  access_token text not null,
  workspace_id text,
  workspace_name text,
  bot_id text,
  database_id text, -- the "Molted" database; null until the player shared a page it could be created in
  database_url text,
  auto_sync boolean not null default true, -- write each new report and reflection by itself
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.notion_connections enable row level security;
revoke all on public.notion_connections from anon, authenticated;
grant all on public.notion_connections to service_role;

-- which report or reflection already has a page, so nothing is written twice
create table public.notion_pages (
  user_id text not null references public.notion_connections (user_id) on delete cascade,
  kind text not null check (kind in ('report', 'reflection')),
  key text not null, -- the day of a report, the id of a reflection
  page_id text not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);
alter table public.notion_pages enable row level security;
revoke all on public.notion_pages from anon, authenticated;
grant all on public.notion_pages to service_role;

create function public.my_notion_connection()
returns table (workspace_name text, database_url text, ready boolean, auto_sync boolean, last_sync_at timestamptz, last_error text, connected_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select n.workspace_name, n.database_url, n.database_id is not null, n.auto_sync, n.last_sync_at, n.last_error, n.created_at
  from public.notion_connections n where n.user_id = (select public.requesting_user_id());
$$;

create function public.set_notion_auto_sync(p_on boolean) returns void
language sql security definer set search_path = '' as $$
  update public.notion_connections set auto_sync = coalesce(p_on, true) where user_id = (select public.requesting_user_id());
$$;

revoke execute on function public.my_notion_connection(), public.set_notion_auto_sync(boolean) from public, anon;
grant execute on function public.my_notion_connection(), public.set_notion_auto_sync(boolean) to authenticated;

-- ============================================================ 4. MCP tokens
-- A token lets an AI agent the player set up (Claude, ChatGPT, ...) read their data and, with can_propose, put
-- proposals into agent_actions as `pending`: the player still confirms each one in the app. Only the SHA-256 of a
-- token is kept; the token itself is shown once, when it is made.
create table public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  token_hash text not null unique,
  hint text not null, -- the last 4 characters, to tell tokens apart
  can_propose boolean not null default true,
  tz text not null default 'Europe/Bucharest', -- "today" for the agent is the player's local day
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  window_start timestamptz, -- calls in the current minute (rate limit, see mcp_token_owner)
  window_count int not null default 0
);
create index mcp_tokens_user on public.mcp_tokens (user_id);
alter table public.mcp_tokens enable row level security;
create policy mcp_tokens_select on public.mcp_tokens for select to authenticated
  using (user_id = (select public.requesting_user_id()));
revoke all on public.mcp_tokens from anon, authenticated;
grant select (id, user_id, name, hint, can_propose, created_at, last_used_at) on public.mcp_tokens to authenticated;
grant all on public.mcp_tokens to service_role;

-- returns the token itself, once
create function public.create_mcp_token(p_name text, p_can_propose boolean default true, p_tz text default null)
returns table (id uuid, token text)
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  label constant text := left(trim(coalesce(p_name, '')), 40);
  raw constant text := 'mlt_' || left(public.integration_secret(), 48);
  made uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if label = '' then raise exception 'a token needs a name' using errcode = 'P0001'; end if;
  perform 1 from public.profiles p where p.id = me for update;
  if (select count(*) from public.mcp_tokens t where t.user_id = me) >= 5 then
    raise exception 'token limit reached' using errcode = 'P0001';
  end if;
  insert into public.mcp_tokens (user_id, name, token_hash, hint, can_propose, tz)
  values (me, label, encode(sha256(convert_to(raw, 'UTF8')), 'hex'), right(raw, 4), coalesce(p_can_propose, true), public.integration_tz(p_tz))
  returning mcp_tokens.id into made;
  return query select made, raw;
end $$;

create function public.revoke_mcp_token(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.mcp_tokens where id = p_id and user_id = (select public.requesting_user_id());
$$;

-- for the `mcp` function: whose token this is. Counts the call; `allowed` is false past 60 calls in a minute.
create function public.mcp_token_owner(p_hash text)
returns table (token_id uuid, user_id text, name text, can_propose boolean, tz text, allowed boolean)
language sql security definer set search_path = '' as $$
  update public.mcp_tokens t
  set last_used_at = now(),
      window_start = case when t.window_start is null or t.window_start < now() - interval '1 minute' then now() else t.window_start end,
      window_count = case when t.window_start is null or t.window_start < now() - interval '1 minute' then 1 else t.window_count + 1 end
  where t.token_hash = p_hash
  returning t.id, t.user_id, t.name, t.can_propose, t.tz, t.window_count <= 60;
$$;

revoke execute on function public.create_mcp_token(text, boolean, text), public.revoke_mcp_token(uuid), public.mcp_token_owner(text) from public, anon, authenticated;
grant execute on function public.create_mcp_token(text, boolean, text), public.revoke_mcp_token(uuid) to authenticated;
grant execute on function public.mcp_token_owner(text) to service_role;

-- ============================================================ 5. the outbox
-- One row per receiver of an event. `ref` names the row the event is about (not its content): the function reads the
-- row when it delivers, so what goes out is what the database holds at that moment.
create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (id) on delete cascade,
  target text not null check (target in ('webhook', 'notion')),
  endpoint_id uuid references public.webhook_endpoints (id) on delete cascade, -- null for Notion
  event text not null check (event in ('habit.checked', 'plan.applied', 'report.created', 'reflection.created')),
  ref jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  response_status int,
  error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index integration_events_due on public.integration_events (next_attempt_at) where status = 'pending';
create index integration_events_user on public.integration_events (user_id, created_at desc);
alter table public.integration_events enable row level security;
create policy integration_events_select on public.integration_events for select to authenticated
  using (user_id = (select public.requesting_user_id()));
revoke all on public.integration_events from anon, authenticated;
grant select on public.integration_events to authenticated;
grant all on public.integration_events to service_role;

-- who hears about an event: every active address subscribed to it and, for reports and reflections, Notion.
-- The same thing still waiting for the same receiver is not queued twice.
create function public.integration_enqueue(p_user text, p_event text, p_ref jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.integration_events (user_id, target, endpoint_id, event, ref)
  select p_user, 'webhook', e.id, p_event, p_ref
  from public.webhook_endpoints e
  where e.user_id = p_user and e.active and p_event = any (e.events)
    and not exists (
      select 1 from public.integration_events q
      where q.endpoint_id = e.id and q.event = p_event and q.ref = p_ref and q.status = 'pending'
    );
  if p_event in ('report.created', 'reflection.created') then
    insert into public.integration_events (user_id, target, event, ref)
    select p_user, 'notion', p_event, p_ref
    from public.notion_connections n
    where n.user_id = p_user and n.auto_sync and n.database_id is not null
      and not exists (
        select 1 from public.integration_events q
        where q.user_id = p_user and q.target = 'notion' and q.event = p_event and q.ref = p_ref and q.status = 'pending'
      );
  end if;
end $$;
revoke execute on function public.integration_enqueue(text, text, jsonb) from public, anon, authenticated;

-- One trigger function for the four tables. Only fresh rows count (an import of old days tells nobody), and nothing
-- that goes wrong here may undo the player's own write.
create function public.trg_integration_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid text := new.user_id;
  changed boolean;
begin
  if not exists (select 1 from public.webhook_endpoints e where e.user_id = uid and e.active)
     and not exists (select 1 from public.notion_connections n where n.user_id = uid and n.auto_sync) then
    return null;
  end if;
  begin
    if tg_table_name = 'completions' then
      if new.day >= current_date - 2 then
        perform public.integration_enqueue(uid, 'habit.checked', jsonb_build_object('habit_id', new.habit_id, 'day', new.day));
      end if;
    elsif tg_table_name = 'agent_actions' then
      -- "applied" by the player's tap or as an automatic step; a reminder Molt sent is not a plan
      if new.status = 'applied' and old.status is distinct from 'applied' and new.kind <> 'set_reminder' then
        perform public.integration_enqueue(uid, 'plan.applied', jsonb_build_object('action_id', new.id));
      end if;
    elsif tg_table_name = 'day_reviews' then
      -- `old` does not exist on an insert, so the two cases are told apart before it is read
      if tg_op = 'INSERT' then changed := true; else changed := old.summary is distinct from new.summary; end if;
      if changed and new.summary is not null and new.day >= current_date - 2 then
        perform public.integration_enqueue(uid, 'report.created', jsonb_build_object('day', new.day));
      end if;
    elsif tg_table_name = 'reflections' then
      perform public.integration_enqueue(uid, 'reflection.created', jsonb_build_object('id', new.id));
    end if;
  exception when others then
    null;
  end;
  return null;
end $$;
revoke execute on function public.trg_integration_event() from public, anon, authenticated;

create trigger completions_integration_event after insert on public.completions
  for each row execute function public.trg_integration_event();
create trigger agent_actions_integration_event after update of status on public.agent_actions
  for each row execute function public.trg_integration_event();
create trigger day_reviews_integration_event after insert or update of summary on public.day_reviews
  for each row execute function public.trg_integration_event();
create trigger reflections_integration_event after insert on public.reflections
  for each row execute function public.trg_integration_event();

-- For the `webhooks` function: takes what is due (each row by one caller only), with the address and secret it goes
-- to. A taken row is hidden for 10 minutes, so a run that dies leaves it for a later one. Old rows are cleared here.
create function public.claim_integration_events(p_limit int default 40)
returns table (id uuid, user_id text, target text, endpoint_id uuid, event text, ref jsonb, attempts int, created_at timestamptz, url text, secret text, endpoint_active boolean)
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.integration_events d where d.status <> 'pending' and d.created_at < now() - interval '14 days';
  update public.integration_events s set status = 'failed', error = coalesce(s.error, 'expired')
  where s.status = 'pending' and s.created_at < now() - interval '3 days';
  return query
  with due as (
    select q.id from public.integration_events q
    where q.status = 'pending' and q.next_attempt_at <= now()
    order by q.created_at
    limit greatest(1, least(coalesce(p_limit, 40), 200))
    for update skip locked
  ), taken as (
    update public.integration_events t
    set attempts = t.attempts + 1, next_attempt_at = now() + interval '10 minutes'
    from due where t.id = due.id
    returning t.*
  )
  select t.id, t.user_id, t.target, t.endpoint_id, t.event, t.ref, t.attempts, t.created_at, e.url, e.secret, coalesce(e.active, true)
  from taken t left join public.webhook_endpoints e on e.id = t.endpoint_id
  order by t.created_at;
end $$;

-- The outcome of one delivery. A failure is retried after 1 min, 5 min, 30 min, 2 h and 12 h, then given up
-- (6 tries in about 15 hours); p_retry false gives up at once (the address is off, the row is gone).
-- An address that failed 20 times in a row is switched off.
create function public.record_integration_result(p_id uuid, p_ok boolean, p_status int default null, p_error text default null, p_retry boolean default true)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  ev public.integration_events%rowtype;
  wait interval;
begin
  select * into ev from public.integration_events q where q.id = p_id for update;
  if not found then return; end if;
  if p_ok then
    update public.integration_events q set status = 'delivered', delivered_at = now(), response_status = p_status, error = null where q.id = ev.id;
  else
    wait := case when not coalesce(p_retry, true) then null else
      case ev.attempts when 1 then interval '1 minute' when 2 then interval '5 minutes' when 3 then interval '30 minutes'
                       when 4 then interval '2 hours' when 5 then interval '12 hours' end end;
    update public.integration_events q
    set status = case when wait is null then 'failed' else 'pending' end,
        next_attempt_at = now() + coalesce(wait, interval '0'),
        response_status = p_status,
        error = left(coalesce(p_error, 'failed'), 300)
    where q.id = ev.id;
  end if;
  if ev.target = 'webhook' and ev.endpoint_id is not null and coalesce(p_retry, true) then
    update public.webhook_endpoints e
    set last_status = p_status,
        last_error = case when p_ok then null else left(coalesce(p_error, 'failed'), 300) end,
        last_delivery_at = now(),
        failures = case when p_ok then 0 else e.failures + 1 end,
        active = case when not p_ok and e.failures + 1 >= 20 then false else e.active end,
        disabled_reason = case when not p_ok and e.failures + 1 >= 20 then 'failures' else e.disabled_reason end
    where e.id = ev.endpoint_id;
  elsif ev.target = 'notion' then
    update public.notion_connections n
    set last_sync_at = case when p_ok then now() else n.last_sync_at end,
        last_error = case when p_ok then null else left(coalesce(p_error, 'failed'), 300) end
    where n.user_id = ev.user_id;
  end if;
end $$;

revoke execute on function public.claim_integration_events(int), public.record_integration_result(uuid, boolean, int, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_integration_events(int), public.record_integration_result(uuid, boolean, int, text, boolean) to service_role;
