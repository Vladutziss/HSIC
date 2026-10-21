-- Email checks (migration 0032): consent, unsubscribe, candidates, claims, privacy of the tables.
-- Plain SQL in one transaction that is rolled back (Supabase SQL editor, or psql -f). It raises an exception naming the
-- first failure; success ends with NOTICE 'email checks passed'.

begin;

insert into public.profiles (id, name, onboarded, settings) values
  ('user_aaa', 'Ana Pop', true, '{}'),
  ('user_bbb', 'Bob', true, '{"prefs":{"lang":"en"}}'),
  ('user_ccc', 'Cris', false, '{}');

do $$
declare
  n int;
  ok boolean;
  tok_a text;
  tok_b text;
  src text;
  denied boolean;
begin
  -- ---- sign-in sync: the address comes from the token, never from the client
  perform set_config('request.jwt.claims', '{"sub":"user_aaa","role":"authenticated","email":"Ana@Molted.TEST"}', true);
  set local role authenticated;
  perform public.sync_email_profile(null);
  reset role;
  select count(*) into n from public.email_preferences where user_id = 'user_aaa' and email = 'ana@molted.test' and marketing_enabled;
  if n <> 1 then raise exception 'sync should create an opted-in row with the lower-cased address'; end if;

  -- sign-up form: unticked box means opted out from the start
  perform set_config('request.jwt.claims', '{"sub":"user_bbb","role":"authenticated","email":"bob@molted.test"}', true);
  set local role authenticated;
  perform public.sync_email_profile(false);
  if public.my_marketing_emails() then raise exception 'B unticked the sign-up box and must be opted out'; end if;
  reset role;
  select unsubscribe_source into src from public.email_preferences where user_id = 'user_bbb';
  if src is distinct from 'signup' then raise exception 'source should be signup, was %', src; end if;

  -- a later sync never overrides the choice
  set local role authenticated;
  perform public.sync_email_profile(true);
  if public.my_marketing_emails() then raise exception 'sync must not re-subscribe'; end if;
  reset role;

  -- C is created by the backfill-like path (no email yet)
  insert into public.email_preferences (user_id) values ('user_ccc');

  -- ---- the tables are not readable through the API
  perform set_config('request.jwt.claims', '{"sub":"user_aaa","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform 1 from public.email_preferences;
    denied := false;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'email_preferences must not be readable by clients'; end if;
  begin
    perform 1 from public.email_log;
    denied := false;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'email_log must not be readable by clients'; end if;
  begin
    perform * from public.email_candidates();
    denied := false;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'email_candidates must be service-role only'; end if;
  reset role;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform public.set_marketing_emails(true);
    denied := false;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'anon must not call set_marketing_emails'; end if;
  reset role;

  -- ---- settings toggle
  perform set_config('request.jwt.claims', '{"sub":"user_aaa","role":"authenticated"}', true);
  set local role authenticated;
  perform public.set_marketing_emails(false);
  if public.my_marketing_emails() then raise exception 'A turned emails off'; end if;
  perform public.set_marketing_emails(true);
  if not public.my_marketing_emails() then raise exception 'A turned emails back on'; end if;
  reset role;
  select count(*) into n from public.email_preferences where user_id = 'user_aaa' and unsubscribed_at is null and unsubscribe_source is null;
  if n <> 1 then raise exception 'turning emails back on must clear the unsubscribe fields'; end if;

  -- ---- service role: candidates, claims, unsubscribe
  set local role service_role;
  update public.email_preferences set email = 'bob@molted.test' where user_id = 'user_bbb';
  update public.email_preferences set email = 'cris@molted.test' where user_id = 'user_ccc';

  select count(*) into n from public.email_candidates() where user_id = 'user_bbb';
  if n <> 0 then raise exception 'an opted-out user must not be a candidate'; end if;
  select count(*) into n from public.email_candidates() where user_id in ('user_aaa', 'user_ccc');
  if n <> 2 then raise exception 'A and C are candidates, found %', n; end if;
  select count(*) into n from public.email_candidates() where user_id = 'user_aaa' and lang = 'ro' and name = 'Ana';
  if n <> 1 then raise exception 'candidate should carry first name and language'; end if;
  select count(*) into n from public.email_candidates() where user_id = 'user_bbb' or lang = 'en';
  if n <> 0 then raise exception 'unexpected english candidate'; end if;

  select count(*) into n from public.claim_email_sends(
    '[{"user_id":"user_bbb","campaign_type":"onboarding_nudge","period_key":"once","template_version":"v1"}]'::jsonb, 7);
  if n <> 0 then raise exception 'claiming for an opted-out user must return nothing'; end if;

  select count(*) into n from public.claim_email_sends(
    '[{"user_id":"user_aaa","campaign_type":"onboarding_nudge","period_key":"once","template_version":"v1","variant":"b"}]'::jsonb, 7);
  if n <> 1 then raise exception 'first claim should succeed, got %', n; end if;
  select count(*) into n from public.claim_email_sends(
    '[{"user_id":"user_aaa","campaign_type":"onboarding_nudge","period_key":"once","template_version":"v1"}]'::jsonb, 7);
  if n <> 0 then raise exception 'running twice must not claim twice'; end if;
  select count(*) into n from public.claim_email_sends(
    '[{"user_id":"user_aaa","campaign_type":"quick_win","period_key":"once","template_version":"v1"}]'::jsonb, 7);
  if n <> 0 then raise exception 'the 7-day gap must block a second campaign'; end if;

  -- a failed send can be claimed again
  update public.email_log set status = 'failed' where user_id = 'user_aaa';
  select count(*) into n from public.claim_email_sends(
    '[{"user_id":"user_aaa","campaign_type":"onboarding_nudge","period_key":"once","template_version":"v1"}]'::jsonb, 7);
  if n <> 1 then raise exception 'a failed send should be claimable again'; end if;

  -- unsubscribed in between: the claim itself refuses
  select unsubscribe_token into tok_a from public.email_preferences where user_id = 'user_aaa';
  select public.unsubscribe_by_token(tok_a, 'header') into ok;
  if not ok then raise exception 'valid token should unsubscribe'; end if;
  select public.unsubscribe_by_token(tok_a, 'link') into ok;
  select unsubscribe_source into src from public.email_preferences where user_id = 'user_aaa';
  if src <> 'header' then raise exception 'second unsubscribe must keep the first source, was %', src; end if;
  select public.unsubscribe_by_token('nope', 'link') into ok;
  if ok then raise exception 'unknown token must do nothing'; end if;
  select count(*) into n from public.email_candidates() where user_id = 'user_aaa';
  if n <> 0 then raise exception 'unsubscribed A must never be a candidate again'; end if;
  select count(*) into n from public.claim_email_sends(
    '[{"user_id":"user_aaa","campaign_type":"feature_tour","period_key":"once","template_version":"v1"}]'::jsonb, 0);
  if n <> 0 then raise exception 'unsubscribed A must never be claimed again'; end if;

  -- bounced address
  update public.email_preferences set bounced_at = now() where user_id = 'user_ccc';
  select count(*) into n from public.email_candidates() where user_id = 'user_ccc';
  if n <> 0 then raise exception 'a bounced address must not be a candidate'; end if;
  reset role;

  -- a new address clears an old bounce
  perform set_config('request.jwt.claims', '{"sub":"user_ccc","role":"authenticated","email":"cris.new@molted.test"}', true);
  set local role authenticated;
  perform public.sync_email_profile(null);
  reset role;
  select count(*) into n from public.email_preferences where user_id = 'user_ccc' and bounced_at is null and email = 'cris.new@molted.test';
  if n <> 1 then raise exception 'a new address should clear the bounce'; end if;

  -- deleting the account removes everything
  delete from public.profiles where id = 'user_aaa';
  select count(*) into n from public.email_preferences where user_id = 'user_aaa';
  select n + count(*) into n from public.email_log where user_id = 'user_aaa';
  if n <> 0 then raise exception 'account deletion must cascade to the email tables'; end if;

  raise notice 'email checks passed';
end $$;

rollback;
