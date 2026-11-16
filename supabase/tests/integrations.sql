-- Integration checks (migration 0042): calendar link, webhooks, the outbox and its triggers, Notion, MCP tokens.
-- Plain SQL in one transaction that is rolled back (SQL editor or psql -f). Raises an exception naming the first
-- failure; success ends with NOTICE 'integration checks passed'. Needs 0042 applied.

begin;

create function public._t_as(sub text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', sub, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function public._t_service() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
end $$;
create function public._t_denied(q text) returns boolean language plpgsql as $$
begin
  execute q;
  return false;
exception when insufficient_privilege then return true;
end $$;
create function public._t_fails(q text) returns boolean language plpgsql as $$
begin
  execute q;
  return false;
exception when others then return true;
end $$;
grant execute on function public._t_as(text), public._t_service(), public._t_denied(text), public._t_fails(text) to authenticated, service_role;

insert into public.profiles (id, name, onboarded) values ('user_aaa', 'Ana', true), ('user_bbb', 'Bob', true);
insert into public.habits (id, user_id, name) values ('h-a', 'user_aaa', 'Citit'), ('h-b', 'user_bbb', 'Alergare');

do $$
declare
  r record;
  n int;
  tok text;
  tok2 text;
  ep uuid;
  ep2 uuid;
  ev uuid;
  act uuid;
  i int;
begin
  -- ============================================================ calendar link
  perform public._t_as('user_aaa');
  select * into r from public.save_calendar_feed('Europe/Bucharest', false, false);
  tok := r.token;
  if tok !~ '^[a-f0-9]{64}$' then raise exception 'the calendar token is not 64 hex characters: %', tok; end if;
  select * into r from public.save_calendar_feed('Nowhere/Land', true, false);
  if r.token <> tok then raise exception 'changing the options replaced the calendar token'; end if;
  if r.tz <> 'Europe/Bucharest' or r.habits is not true then raise exception 'an unknown time zone was kept or the option was lost: % %', r.tz, r.habits; end if;
  select * into r from public.save_calendar_feed('Europe/London', true, true);
  tok2 := r.token;
  if tok2 = tok then raise exception 'rotating kept the old calendar token'; end if;
  if not public._t_denied($q$insert into public.calendar_feeds (user_id) values ('user_aaa')$q$) then raise exception 'LEAK: a client inserted a calendar feed directly'; end if;
  if not public._t_denied($q$update public.calendar_feeds set token = repeat('a', 64)$q$) then raise exception 'LEAK: a client chose its own calendar token'; end if;
  if not public._t_denied($q$select * from public.calendar_feed_owner(repeat('a', 64))$q$) then raise exception 'LEAK: a client can look up the owner of a calendar token'; end if;

  perform public._t_as('user_bbb');
  select count(*) into n from public.calendar_feeds;
  if n <> 0 then raise exception 'LEAK: B reads % calendar feeds of A', n; end if;

  perform public._t_service();
  select count(*) into n from public.calendar_feed_owner(tok);
  if n <> 0 then raise exception 'the replaced calendar token still works'; end if;
  select * into r from public.calendar_feed_owner(tok2);
  if r.user_id is distinct from 'user_aaa' or r.tz <> 'Europe/London' then raise exception 'the calendar token does not lead to its owner'; end if;
  select count(*) into n from public.calendar_feed_owner('not-a-token');
  if n <> 0 then raise exception 'a malformed calendar token found an owner'; end if;
  if (select last_fetched_at from public.calendar_feeds where user_id = 'user_aaa') is null then raise exception 'a visit to the calendar was not noted'; end if;

  perform public._t_as('user_aaa');
  perform public.remove_calendar_feed();
  select count(*) into n from public.calendar_feeds;
  if n <> 0 then raise exception 'the calendar feed was not removed'; end if;

  -- ============================================================ webhook addresses
  if not public._t_fails($q$select public.create_webhook_endpoint('http://example.com/hook', array['habit.checked'])$q$) then raise exception 'an http address was accepted'; end if;
  if not public._t_fails($q$select public.create_webhook_endpoint('https://user:pw@example.com/hook', array['habit.checked'])$q$) then raise exception 'an address with credentials was accepted'; end if;
  if not public._t_fails($q$select public.create_webhook_endpoint('https://[::1]/hook', array['habit.checked'])$q$) then raise exception 'an IPv6 literal was accepted'; end if;
  if not public._t_fails($q$select public.create_webhook_endpoint('https://example.com/a b', array['habit.checked'])$q$) then raise exception 'an address with a space was accepted'; end if;
  if not public._t_fails($q$select public.create_webhook_endpoint('https://example.com/hook', array['habit.checked', 'everything'])$q$) then raise exception 'an unknown event was accepted'; end if;
  if not public._t_fails($q$select public.create_webhook_endpoint('https://example.com/hook', array[]::text[])$q$) then raise exception 'an address with no events was accepted'; end if;

  select * into r from public.create_webhook_endpoint(' https://hooks.example.com/molted ', array['habit.checked', 'report.created', 'habit.checked']);
  ep := r.id;
  if r.url <> 'https://hooks.example.com/molted' then raise exception 'the address was not trimmed: %', r.url; end if;
  if r.secret !~ '^whsec_[A-Za-z0-9+/]{43}=$' then raise exception 'the signing secret is not whsec_ + base64 of 32 bytes: %', r.secret; end if;
  if cardinality(r.events) <> 2 then raise exception 'duplicate events were kept'; end if;
  select * into r from public.create_webhook_endpoint('https://hooks.example.com/plans', array['plan.applied', 'reflection.created']);
  ep2 := r.id;
  perform public.create_webhook_endpoint('https://hooks.example.com/three', array['habit.checked']);
  if not public._t_fails($q$select public.create_webhook_endpoint('https://hooks.example.com/four', array['habit.checked'])$q$) then raise exception 'a fourth address was accepted (the limit is 3)'; end if;
  perform public.delete_webhook_endpoint((select id from public.webhook_endpoints where url like '%/three'));
  select count(*) into n from public.webhook_endpoints;
  if n <> 2 then raise exception 'A should have 2 addresses, has %', n; end if;
  if not public._t_denied($q$insert into public.webhook_endpoints (user_id, url, secret, events) values ('user_aaa', 'https://x.example.com', 's', array['habit.checked'])$q$) then raise exception 'LEAK: a client inserted an address directly'; end if;
  if not public._t_denied($q$update public.webhook_endpoints set secret = 'mine'$q$) then raise exception 'LEAK: a client changed a signing secret'; end if;

  perform public._t_as('user_bbb');
  select count(*) into n from public.webhook_endpoints;
  if n <> 0 then raise exception 'LEAK: B reads % addresses of A', n; end if;
  select count(*) into n from public.update_webhook_endpoint(ep, array['plan.applied'], false);
  if n <> 0 then raise exception 'LEAK: B changed an address of A'; end if;
  perform public.delete_webhook_endpoint(ep);
  perform public._t_as('user_aaa');
  select count(*) into n from public.webhook_endpoints where id = ep and active and events @> array['habit.checked'];
  if n <> 1 then raise exception 'LEAK: B deleted or changed an address of A'; end if;

  -- ============================================================ events reach the outbox
  -- a fresh check-in tells the address that listens for it, once
  insert into public.completions (user_id, habit_id, day, code) values ('user_aaa', 'h-a', current_date, 1);
  select count(*) into n from public.integration_events where event = 'habit.checked';
  if n <> 1 then raise exception 'a check-in should queue 1 event, queued %', n; end if;
  select endpoint_id, ref into r from public.integration_events where event = 'habit.checked';
  if r.endpoint_id <> ep or r.ref ->> 'habit_id' <> 'h-a' or (r.ref ->> 'day')::date <> current_date then raise exception 'the check-in event names the wrong address or row'; end if;
  -- an old day (an import) tells nobody
  insert into public.completions (user_id, habit_id, day, code) values ('user_aaa', 'h-a', current_date - 30, 1);
  select count(*) into n from public.integration_events where event = 'habit.checked';
  if n <> 1 then raise exception 'a check-in for an old day was announced'; end if;
  if not public._t_denied($q$insert into public.integration_events (user_id, target, event) values ('user_aaa', 'notion', 'report.created')$q$) then raise exception 'LEAK: a client wrote into the outbox'; end if;
  if not public._t_denied($q$select * from public.claim_integration_events(10)$q$) then raise exception 'LEAK: a client can claim deliveries'; end if;
  if not public._t_denied($q$select public.record_integration_result(gen_random_uuid(), true)$q$) then raise exception 'LEAK: a client can record delivery results'; end if;

  -- a report: announced when its text arrives, not when only the score changes
  insert into public.day_reviews (user_id, day, ai_score, at) values ('user_aaa', current_date, 70, now());
  select count(*) into n from public.integration_events where event = 'report.created';
  if n <> 0 then raise exception 'a report without text was announced'; end if;
  update public.day_reviews set summary = 'O zi bună.', highlight = 'Citit', tip = 'Continuă.', ai = true where user_id = 'user_aaa' and day = current_date;
  select count(*) into n from public.integration_events where event = 'report.created';
  if n <> 1 then raise exception 'a report with text should queue 1 event, queued %', n; end if;
  update public.day_reviews set ai_score = 80 where user_id = 'user_aaa' and day = current_date;
  update public.day_reviews set summary = 'O zi foarte bună.' where user_id = 'user_aaa' and day = current_date;
  select count(*) into n from public.integration_events where event = 'report.created';
  if n <> 1 then raise exception 'the same report was queued twice while still waiting (%)', n; end if;
  insert into public.day_reviews (user_id, day, summary) values ('user_aaa', current_date - 1, 'Ieri.');
  select count(*) into n from public.integration_events where event = 'report.created';
  if n <> 2 then raise exception 'a report inserted with its text was not announced (%)', n; end if;

  -- a proposal is announced when it is applied, not when it is made; a reminder Molt sent is not a plan
  insert into public.agent_actions (user_id, run_id, kind, autonomy, payload, reason) values ('user_aaa', 'ui-1', 'create_todo', 'confirm', '{"title":"Recapitulare"}', 'test')
  returning id into act;
  select count(*) into n from public.integration_events where event = 'plan.applied';
  if n <> 0 then raise exception 'a pending proposal was announced as applied'; end if;
  update public.agent_actions set status = 'applied', decided_at = now() where id = act;
  update public.agent_actions set status = 'applied' where id = act;
  select count(*) into n from public.integration_events where event = 'plan.applied' and endpoint_id = ep2 and ref ->> 'action_id' = act::text;
  if n <> 1 then raise exception 'an applied proposal should queue 1 event, queued %', n; end if;
  insert into public.agent_actions (user_id, run_id, kind, autonomy, payload, reason) values ('user_aaa', 'nudge-1', 'set_reminder', 'auto', '{}', 'test') returning id into act;
  update public.agent_actions set status = 'applied' where id = act;
  select count(*) into n from public.integration_events where event = 'plan.applied';
  if n <> 1 then raise exception 'a reminder was announced as an applied plan'; end if;

  insert into public.reflections (user_id, week, answer, observation, next_step) values ('user_aaa', '2026-W47', 'Am citit.', 'Bine.', 'Mai citește.');
  select count(*) into n from public.integration_events where event = 'reflection.created' and endpoint_id = ep2;
  if n <> 1 then raise exception 'a reflection should queue 1 event, queued %', n; end if;

  -- a paused address hears nothing; B's own activity tells nobody (B has no address) and is not held up
  perform public.update_webhook_endpoint(ep2, null, false);
  insert into public.reflections (user_id, week, answer, observation, next_step) values ('user_aaa', '2026-W48', 'x', 'y', 'z');
  select count(*) into n from public.integration_events where event = 'reflection.created';
  if n <> 1 then raise exception 'a paused address was told about an event'; end if;
  perform public._t_as('user_bbb');
  insert into public.completions (user_id, habit_id, day, code) values ('user_bbb', 'h-b', current_date, 1);
  select count(*) into n from public.integration_events;
  if n <> 0 then raise exception 'LEAK: B reads % outbox rows', n; end if;
  perform public._t_service();
  select count(*) into n from public.integration_events where user_id = 'user_bbb';
  if n <> 0 then raise exception 'an account with no integration got % outbox rows', n; end if;

  -- ============================================================ delivery: claim, retry, give up, switch off
  select count(*) into n from public.claim_integration_events(100);
  if n <> 5 then raise exception 'claim should hand out the 5 waiting events, gave %', n; end if;
  select count(*) into n from public.claim_integration_events(100);
  if n <> 0 then raise exception 'a claimed event was handed out twice'; end if;
  select id into ev from public.integration_events where event = 'habit.checked';
  perform public.record_integration_result(ev, true, 200, null);
  select status, attempts, response_status into r from public.integration_events where id = ev;
  if r.status <> 'delivered' or r.attempts <> 1 or r.response_status <> 200 then raise exception 'a delivered event was not recorded as such'; end if;
  select failures, last_status, last_delivery_at into r from public.webhook_endpoints where id = ep;
  if r.failures <> 0 or r.last_status <> 200 or r.last_delivery_at is null then raise exception 'the address does not show its last delivery'; end if;

  -- with its first report delivered, a changed text is announced again
  select id into ev from public.integration_events where event = 'report.created' and (ref ->> 'day')::date = current_date;
  perform public.record_integration_result(ev, true, 204, null);
  update public.day_reviews set summary = 'Altă zi.' where user_id = 'user_aaa' and day = current_date;
  select count(*) into n from public.integration_events where event = 'report.created' and (ref ->> 'day')::date = current_date;
  if n <> 2 then raise exception 'a changed report was not announced again after the first delivery (%)', n; end if;

  -- a failure is retried later (1 minute after the first try), and given up after the sixth
  select id into ev from public.integration_events where event = 'report.created' and (ref ->> 'day')::date = current_date - 1;
  perform public.record_integration_result(ev, false, 500, 'HTTP 500');
  select status, next_attempt_at, error into r from public.integration_events where id = ev;
  if r.status <> 'pending' or r.next_attempt_at > now() + interval '61 seconds' or r.next_attempt_at < now() + interval '59 seconds' or r.error <> 'HTTP 500' then
    raise exception 'a failed delivery was not scheduled for a retry in 1 minute';
  end if;
  update public.integration_events set attempts = 6 where id = ev;
  perform public.record_integration_result(ev, false, 500, 'HTTP 500');
  if (select status from public.integration_events where id = ev) <> 'failed' then raise exception 'a delivery was not given up after 6 tries'; end if;
  if (select failures from public.webhook_endpoints where id = ep) <> 2 then raise exception 'failures in a row were not counted'; end if;

  -- 20 failures in a row switch the address off; switching it back on forgives them
  update public.webhook_endpoints set failures = 19 where id = ep;
  select id into ev from public.integration_events where event = 'report.created' and status = 'pending' limit 1;
  update public.integration_events set attempts = 1 where id = ev;
  perform public.record_integration_result(ev, false, null, 'timeout');
  select active, disabled_reason into r from public.webhook_endpoints where id = ep;
  if r.active or r.disabled_reason is distinct from 'failures' then raise exception 'an address that failed 20 times in a row was not switched off'; end if;
  perform public._t_as('user_aaa');
  select * into r from public.update_webhook_endpoint(ep, null, true);
  if not r.active or r.failures <> 0 or r.disabled_reason is not null then raise exception 'switching an address back on did not forgive its failures'; end if;
  select count(*) into n from public.integration_events;
  if n < 5 then raise exception 'A should read her own delivery log, saw % rows', n; end if;

  -- ============================================================ Notion
  perform public._t_service();
  insert into public.notion_connections (user_id, access_token, workspace_name, database_id, database_url) values ('user_aaa', 'enc:secret', 'Ana''s Notion', 'db-1', 'https://notion.so/db-1');
  perform public._t_as('user_aaa');
  if not public._t_denied($q$select * from public.notion_connections$q$) then raise exception 'LEAK: a client reads the Notion connection (and its token)'; end if;
  if not public._t_denied($q$select * from public.notion_pages$q$) then raise exception 'LEAK: a client reads notion_pages'; end if;
  select * into r from public.my_notion_connection();
  if r.workspace_name <> 'Ana''s Notion' or not r.ready or not r.auto_sync then raise exception 'my_notion_connection does not describe the connection'; end if;
  insert into public.reflections (user_id, week, answer, observation, next_step) values ('user_aaa', '2026-W49', 'a', 'b', 'c');
  perform public._t_service();
  select count(*) into n from public.integration_events where target = 'notion' and event = 'reflection.created' and endpoint_id is null;
  if n <> 1 then raise exception 'a reflection should be queued for Notion once, queued %', n; end if;
  select id into ev from public.integration_events where target = 'notion';
  perform public.record_integration_result(ev, false, 401, 'unauthorized', false);
  if (select status from public.integration_events where id = ev) <> 'failed' then raise exception 'p_retry false did not give up at once'; end if;
  if (select last_error from public.notion_connections where user_id = 'user_aaa') <> 'unauthorized' then raise exception 'the Notion error was not kept for the player'; end if;
  perform public._t_as('user_aaa');
  perform public.set_notion_auto_sync(false);
  insert into public.reflections (user_id, week, answer, observation, next_step) values ('user_aaa', '2026-W50', 'a', 'b', 'c');
  perform public._t_service();
  select count(*) into n from public.integration_events where target = 'notion';
  if n <> 1 then raise exception 'Notion was told about an event with automatic writing off'; end if;
  perform public._t_as('user_bbb');
  select count(*) into n from public.my_notion_connection();
  if n <> 0 then raise exception 'LEAK: B sees a Notion connection'; end if;

  -- ============================================================ MCP tokens
  perform public._t_as('user_aaa');
  if not public._t_fails($q$select public.create_mcp_token('   ', true, null)$q$) then raise exception 'a token without a name was made'; end if;
  select * into r from public.create_mcp_token('  Claude Desktop ', true, 'Europe/Bucharest');
  tok := r.token;
  if tok !~ '^mlt_[a-f0-9]{48}$' then raise exception 'the MCP token has the wrong shape: %', tok; end if;
  select name, hint, can_propose into r from public.mcp_tokens;
  if r.name <> 'Claude Desktop' or r.hint <> right(tok, 4) or not r.can_propose then raise exception 'the token row does not describe the token'; end if;
  if not public._t_denied($q$select token_hash from public.mcp_tokens$q$) then raise exception 'LEAK: a client reads token hashes'; end if;
  if not public._t_denied($q$select * from public.mcp_token_owner('x')$q$) then raise exception 'LEAK: a client can look up the owner of a token'; end if;
  if not public._t_denied($q$insert into public.mcp_tokens (user_id, name, token_hash, hint) values ('user_aaa', 'x', 'y', 'zzzz')$q$) then raise exception 'LEAK: a client inserted a token directly'; end if;
  for i in 1..4 loop perform public.create_mcp_token('t' || i, false, null); end loop;
  if not public._t_fails($q$select public.create_mcp_token('six', true, null)$q$) then raise exception 'a sixth token was made (the limit is 5)'; end if;

  perform public._t_as('user_bbb');
  select count(*) into n from public.mcp_tokens;
  if n <> 0 then raise exception 'LEAK: B reads % tokens of A', n; end if;
  perform public.revoke_mcp_token((select id from public.mcp_tokens limit 1));

  perform public._t_service();
  if (select token_hash from public.mcp_tokens where name = 'Claude Desktop') <> encode(sha256(convert_to(tok, 'UTF8')), 'hex') then raise exception 'the stored hash is not the SHA-256 of the token'; end if;
  if exists (select 1 from public.mcp_tokens where token_hash = tok) then raise exception 'the token itself was stored'; end if;
  select * into r from public.mcp_token_owner(encode(sha256(convert_to(tok, 'UTF8')), 'hex'));
  if r.user_id is distinct from 'user_aaa' or not r.can_propose or not r.allowed or r.name <> 'Claude Desktop' then raise exception 'the token does not lead to its owner'; end if;
  select count(*) into n from public.mcp_token_owner(encode(sha256(convert_to('mlt_wrong', 'UTF8')), 'hex'));
  if n <> 0 then raise exception 'an unknown token found an owner'; end if;
  for i in 1..59 loop perform public.mcp_token_owner(encode(sha256(convert_to(tok, 'UTF8')), 'hex')); end loop;
  select allowed into r from public.mcp_token_owner(encode(sha256(convert_to(tok, 'UTF8')), 'hex'));
  if r.allowed then raise exception 'call 61 within a minute was allowed'; end if;
  update public.mcp_tokens set window_start = now() - interval '2 minutes' where name = 'Claude Desktop';
  select allowed into r from public.mcp_token_owner(encode(sha256(convert_to(tok, 'UTF8')), 'hex'));
  if not r.allowed then raise exception 'the rate limit did not reset after a minute'; end if;

  perform public._t_as('user_aaa');
  perform public.revoke_mcp_token((select id from public.mcp_tokens where name = 'Claude Desktop'));
  perform public._t_service();
  select count(*) into n from public.mcp_token_owner(encode(sha256(convert_to(tok, 'UTF8')), 'hex'));
  if n <> 0 then raise exception 'a revoked token still works'; end if;

  -- ============================================================ deleting the account takes everything with it
  delete from public.profiles where id = 'user_aaa';
  select (select count(*) from public.webhook_endpoints) + (select count(*) from public.integration_events) + (select count(*) from public.notion_connections)
       + (select count(*) from public.notion_pages) + (select count(*) from public.mcp_tokens) + (select count(*) from public.calendar_feeds) into n;
  if n <> 0 then raise exception 'deleting the account left % integration rows behind', n; end if;

  reset role;
  raise notice 'integration checks passed';
end $$;

rollback;
