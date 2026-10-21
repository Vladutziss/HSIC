-- Giveaway checks (migration 0031): RLS, lifecycle, entries, winners, attribution, deletion.
-- Plain SQL in one transaction that is rolled back (Supabase SQL editor, or psql -f). It raises an exception naming the
-- first failure; success ends with NOTICE 'giveaway checks passed'.
-- Needs 0031 applied. To try 0031 without applying it, paste 0031_giveaways.sql above this file, without this file's
-- begin; and rollback; lines... or simply wrap both in one begin; ... rollback;

begin;

-- test helpers (rolled back with everything else)
create function public._t_as(sub text, em text default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', sub, 'role', 'authenticated', 'email', em)::text, true);
  set local role authenticated;
end $$;
create function public._t_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
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
  ('user_aaa', 'Ana', true), ('user_bbb', 'Bob', false), ('user_ccc', 'Cris', true), ('user_ddd', 'Dan', true), ('user_admin', 'Admin', true);

do $$
declare
  adm constant text := 'admin@molted.test';
  n int;
  msg text;
  j jsonb;
  cid uuid;
  wid uuid;
  wid2 uuid;
  eid uuid;
begin
  -- ---------------------------------------------------------------- admin creates a draft; nobody else can touch campaigns
  perform public._t_as('user_admin', adm);
  insert into public.giveaway_campaigns (slug, internal_name, title, description, prize_name, starts_at, ends_at, terms)
    values ('molt-3d', 'Molt 3D print', 'Molt 3D', 'Câștigă un Molt imprimat 3D.', 'Figurină Molt', now() - interval '1 day', now() + interval '7 days', 'Regulament oficial de test.')
    returning id into cid;
  insert into public.giveaway_partners (slug, name, active) values ('plato-print', 'Plato Print', true);
  insert into public.giveaway_campaign_partners (campaign_id, partner_id) select cid, id from public.giveaway_partners where slug = 'plato-print';
  insert into public.giveaway_sources (campaign_id, source, medium, label) values (cid, 'plato_print', 'qr', 'Poster Plato'), (cid, 'plao_streetball', 'qr', 'Teren');
  reset role;

  perform public._t_as('user_aaa');
  select count(*) into n from public.giveaway_campaigns;
  if n <> 0 then raise exception 'LEAK: a player reads campaigns (%)', n; end if;
  if not public._t_denied($q$insert into public.giveaway_campaigns (slug, internal_name, starts_at, ends_at) values ('hack-it', 'x', now(), now() + interval '1 day')$q$) then
    raise exception 'LEAK: a player created a campaign';
  end if;
  update public.giveaway_campaigns set title = 'hacked';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'LEAK: a player updated % campaigns', n; end if;
  select count(*) into n from public.giveaway_partners;
  if n <> 0 then raise exception 'LEAK: a player reads partners'; end if;
  reset role;

  perform public._t_anon();
  if not public._t_denied('select count(*) from public.giveaway_campaigns') then raise exception 'LEAK: anon reads campaigns'; end if;
  if not public._t_denied('select count(*) from public.giveaway_entries') then raise exception 'LEAK: anon reads entries'; end if;
  if not public._t_denied('select count(*) from public.giveaway_winners') then raise exception 'LEAK: anon reads winners'; end if;
  if not public._t_denied('select count(*) from public.giveaway_events') then raise exception 'LEAK: anon reads events'; end if;
  -- ---------------------------------------------------------------- a draft is invisible to the public
  j := public.get_giveaway('molt-3d');
  if (j ->> 'found')::boolean then raise exception 'a draft is public'; end if;
  if jsonb_array_length(public.get_giveaways()) <> 0 then raise exception 'a draft is listed'; end if;
  reset role;

  -- ---------------------------------------------------------------- lifecycle guard
  perform public._t_as('user_admin', adm);
  msg := public._t_err($q$update public.giveaway_campaigns set status = 'active' where slug = 'molt-3d'$q$);
  if msg is distinct from 'checklist_incomplete:terms_reviewed' then raise exception 'publishing without the checklist should fail, got %', msg; end if;
  update public.giveaway_campaigns set checklist = '{"terms_reviewed":true,"eligibility_reviewed":true,"prize_conditions_reviewed":true,"data_processing_reviewed":true,"minors_reviewed":true}' where slug = 'molt-3d';
  msg := public._t_err($q$update public.giveaway_campaigns set status = 'completed' where slug = 'molt-3d'$q$);
  if msg not like 'invalid_transition:%' then raise exception 'draft -> completed should be refused, got %', msg; end if;
  update public.giveaway_campaigns set status = 'active' where slug = 'molt-3d';
  select count(*) into n from public.giveaway_campaigns where slug = 'molt-3d' and published_at is not null;
  if n <> 1 then raise exception 'published_at was not set'; end if;
  msg := public._t_err($q$update public.giveaway_campaigns set slug = 'other-slug' where slug = 'molt-3d'$q$);
  if msg is distinct from 'slug_locked' then raise exception 'the slug of a published campaign must be locked, got %', msg; end if;
  msg := public._t_err($q$update public.giveaway_campaigns set status = 'draft' where slug = 'molt-3d'$q$);
  if msg not like 'invalid_transition:%' then raise exception 'active -> draft should be refused, got %', msg; end if;
  msg := public._t_err($q$delete from public.giveaway_campaigns where slug = 'molt-3d'$q$);
  select count(*) into n from public.giveaway_campaigns where slug = 'molt-3d';
  if n <> 1 then raise exception 'a published campaign was deleted'; end if;
  reset role;

  -- ---------------------------------------------------------------- public reads: only public fields
  perform public._t_anon();
  j := public.get_giveaway('MOLT-3D');
  if not (j ->> 'found')::boolean or j ->> 'phase' <> 'active' or not (j ->> 'entries_open')::boolean then raise exception 'active campaign not public: %', j; end if;
  if j ? 'internal_name' or j ? 'checklist' or j ? 'created_by' or j ? 'internal_notes' or j ? 'max_entries' then raise exception 'LEAK: internal fields in public json: %', j; end if;
  if jsonb_array_length(j -> 'partners') <> 1 then raise exception 'partner missing from public json'; end if;
  if jsonb_array_length(public.get_giveaways()) <> 1 then raise exception 'active campaign not listed'; end if;
  if (public.get_giveaway('nope') ->> 'found')::boolean then raise exception 'unknown slug found'; end if;
  reset role;

  -- ---------------------------------------------------------------- entering
  perform public._t_anon();
  if not public._t_denied($q$select public.enter_giveaway('molt-3d', true, true)$q$) then raise exception 'anon can call enter_giveaway'; end if;
  reset role;

  perform public._t_as('user_aaa');
  msg := public._t_err($q$select public.enter_giveaway('molt-3d', false, true)$q$);
  if msg <> 'rules_not_accepted' then raise exception 'rules must be accepted, got %', msg; end if;
  msg := public._t_err($q$select public.enter_giveaway('molt-3d', true, false)$q$);
  if msg <> 'attestation_required' then raise exception 'attestation must be given, got %', msg; end if;
  msg := public._t_err($q$select public.enter_giveaway('nope', true, true)$q$);
  if msg <> 'not_found' then raise exception 'unknown campaign, got %', msg; end if;
  j := public.enter_giveaway('molt-3d', true, true, 'plato_print', 'qr');
  if j ->> 'status' <> 'entered' then raise exception 'entry refused: %', j; end if;
  j := public.enter_giveaway('molt-3d', true, true, 'poster', 'qr');
  if j ->> 'status' <> 'already_entered' then raise exception 'a second entry was not refused: %', j; end if;
  select count(*) into n from public.giveaway_entries;
  if n <> 1 then raise exception 'A should see her one entry, saw %', n; end if;
  if (public.get_giveaway('molt-3d') -> 'me' ->> 'entered')::boolean is not true then raise exception 'me.entered missing'; end if;
  -- direct writes to entries are not possible
  if not public._t_denied($q$insert into public.giveaway_entries (campaign_id, user_id, rules_accepted_at) select id, 'user_aaa', now() from public.giveaway_campaigns$q$) then
    raise exception 'LEAK: a player wrote an entry directly';
  end if;
  if not public._t_denied($q$update public.giveaway_entries set status = 'valid', source = 'event'$q$) then raise exception 'LEAK: a player edited an entry'; end if;
  reset role;

  perform public._t_as('user_bbb');
  msg := public._t_err($q$select public.enter_giveaway('molt-3d', true, true)$q$);
  if msg <> 'not_onboarded' then raise exception 'an un-onboarded player entered, got %', msg; end if;
  select count(*) into n from public.giveaway_entries;
  if n <> 0 then raise exception 'LEAK: B reads A''s entry'; end if;
  reset role;

  perform public._t_as('user_nobody');
  msg := public._t_err($q$select public.enter_giveaway('molt-3d', true, true)$q$);
  if msg <> 'no_profile' then raise exception 'a user without a profile entered, got %', msg; end if;
  reset role;

  -- entries are locked-in rules: eligibility cannot change under them; the cap can
  perform public._t_as('user_admin', adm);
  msg := public._t_err($q$update public.giveaway_campaigns set eligibility = '{"requireOnboarded": false}' where slug = 'molt-3d'$q$);
  if msg <> 'eligibility_locked' then raise exception 'eligibility must be locked after entries, got %', msg; end if;
  update public.giveaway_campaigns set max_entries = 1 where slug = 'molt-3d';
  reset role;
  perform public._t_as('user_ccc');
  msg := public._t_err($q$select public.enter_giveaway('molt-3d', true, true)$q$);
  if msg <> 'full' then raise exception 'the entry cap was not enforced, got %', msg; end if;
  reset role;
  perform public._t_as('user_admin', adm);
  update public.giveaway_campaigns set max_entries = null where slug = 'molt-3d';
  reset role;

  -- ---------------------------------------------------------------- pause, resume, window boundaries
  perform public._t_as('user_admin', adm);
  update public.giveaway_campaigns set status = 'paused' where slug = 'molt-3d';
  reset role;
  perform public._t_as('user_ccc');
  msg := public._t_err($q$select public.enter_giveaway('molt-3d', true, true)$q$);
  if msg <> 'paused' then raise exception 'entry on a paused campaign, got %', msg; end if;
  if (public.get_giveaway('molt-3d') ->> 'entries_open')::boolean then raise exception 'paused campaign shows entries open'; end if;
  reset role;
  perform public._t_as('user_admin', adm);
  update public.giveaway_campaigns set paused_visibility = 'hidden' where slug = 'molt-3d';
  reset role;
  perform public._t_anon();
  j := public.get_giveaway('molt-3d');
  if (j ->> 'found')::boolean is not true or j ? 'prize' or (j ->> 'hidden')::boolean is not true then raise exception 'hidden paused campaign leaks details: %', j; end if;
  if jsonb_array_length(public.get_giveaways()) <> 0 then raise exception 'hidden paused campaign is listed'; end if;
  reset role;
  perform public._t_as('user_admin', adm);
  update public.giveaway_campaigns set status = 'active', paused_visibility = 'visible' where slug = 'molt-3d';
  -- not started yet
  update public.giveaway_campaigns set starts_at = now() + interval '1 day', ends_at = now() + interval '3 days' where slug = 'molt-3d';
  reset role;
  perform public._t_as('user_ccc');
  msg := public._t_err($q$select public.enter_giveaway('molt-3d', true, true)$q$);
  if msg <> 'not_started' then raise exception 'entry before the start, got %', msg; end if;
  if public.get_giveaway('molt-3d') ->> 'phase' <> 'scheduled' then raise exception 'phase should be scheduled'; end if;
  reset role;
  -- window open again, then over
  perform public._t_as('user_admin', adm);
  update public.giveaway_campaigns set starts_at = now() - interval '2 days', ends_at = now() + interval '1 hour' where slug = 'molt-3d';
  reset role;
  perform public._t_as('user_ccc');
  j := public.enter_giveaway('molt-3d', true, true, 'event', 'link');
  if j ->> 'status' <> 'entered' then raise exception 'C should enter inside the window: %', j; end if;
  reset role;
  perform public._t_as('user_admin', adm);
  update public.giveaway_campaigns set starts_at = now() - interval '2 days', ends_at = now() - interval '1 second' where slug = 'molt-3d';
  reset role;
  perform public._t_as('user_ddd');
  msg := public._t_err($q$select public.enter_giveaway('molt-3d', true, true)$q$);
  if msg <> 'ended' then raise exception 'entry after the end, got %', msg; end if;
  if public.get_giveaway('molt-3d') ->> 'phase' <> 'ended' then raise exception 'phase should be ended'; end if;
  reset role;

  -- ---------------------------------------------------------------- winners
  perform public._t_as('user_aaa');
  msg := public._t_err(format('select public.draw_giveaway_winner(%L)', cid));
  if msg <> 'forbidden' then raise exception 'a player drew a winner, got %', msg; end if;
  select count(*) into n from public.giveaway_winners;
  if n <> 0 then raise exception 'LEAK: a player reads winners'; end if;
  reset role;

  perform public._t_as('user_admin', adm);
  update public.giveaway_campaigns set ends_at = now() + interval '1 hour' where slug = 'molt-3d'; -- running again
  msg := public._t_err(format('select public.draw_giveaway_winner(%L)', cid));
  if msg <> 'draw_not_allowed:active' then raise exception 'drawing while running must fail, got %', msg; end if;
  update public.giveaway_campaigns set status = 'completed' where slug = 'molt-3d';
  msg := public._t_err(format('select public.select_giveaway_winner_manual(%L, %L, %L)', cid, gen_random_uuid(), 'scurt'));
  if msg <> 'reason_required' then raise exception 'manual pick needs a reason, got %', msg; end if;
  j := public.draw_giveaway_winner(cid);
  wid := (j ->> 'winner_id')::uuid;
  if (j ->> 'pool_size')::int <> 2 then raise exception 'pool should be the 2 valid entries, got %', j; end if;
  msg := public._t_err(format('select public.draw_giveaway_winner(%L)', cid));
  if msg <> 'winners_complete' then raise exception 'second draw for a one-winner campaign, got %', msg; end if;
  select count(*) into n from public.giveaway_winners where audit ? 'pool_digest_md5' and selection_method = 'random_draw';
  if n <> 1 then raise exception 'the draw was not audited'; end if;
  -- announcing is explicit; the public sees only the label
  reset role;
  perform public._t_anon();
  if jsonb_array_length(public.get_giveaway('molt-3d') -> 'winners') <> 0 then raise exception 'a winner is public before being announced'; end if;
  reset role;
  perform public._t_as('user_admin', adm);
  perform public.update_giveaway_winner(wid, 'notified', 'arranged', 'trimis email');
  perform public.announce_giveaway_winner(wid, 'A. P.');
  reset role;
  perform public._t_anon();
  j := public.get_giveaway('molt-3d');
  if j -> 'winners' <> '["A. P."]'::jsonb then raise exception 'public winners wrong: %', j -> 'winners'; end if;
  if j::text like '%user_%' or j::text like '%trimis email%' then raise exception 'LEAK: private winner data in public json'; end if;
  reset role;
  -- correction: void with a reason, draw again
  perform public._t_as('user_admin', adm);
  msg := public._t_err(format('select public.void_giveaway_winner(%L, %L)', wid, 'scurt'));
  if msg <> 'reason_required' then raise exception 'voiding needs a reason, got %', msg; end if;
  perform public.void_giveaway_winner(wid, 'câștigătorul nu a răspuns în termen');
  j := public.draw_giveaway_winner(cid);
  wid2 := (j ->> 'winner_id')::uuid;
  if wid2 = wid then raise exception 'a voided winner was drawn again'; end if;
  select count(*) into n from public.giveaway_audit where campaign_id = cid and action in ('winner_drawn', 'winner_voided', 'winner_announced');
  if n < 4 then raise exception 'winner steps are not all in the audit trail (%)', n; end if;
  select entry_id into eid from public.giveaway_winners where id = wid2;
  perform public.disqualify_giveaway_entry(eid, 'cont duplicat');
  select count(*) into n from public.giveaway_winners where id = wid2 and status = 'voided';
  if n <> 1 then raise exception 'disqualifying an entry must void its winner'; end if;
  reset role;

  -- ---------------------------------------------------------------- cancellation
  perform public._t_as('user_admin', adm);
  insert into public.giveaway_campaigns (slug, internal_name, title, description, prize_name, starts_at, ends_at, terms,
    checklist)
    values ('second', 'Second', 'Al doilea', 'desc', 'Premiu', now() - interval '1 day', now() + interval '2 days', 'reguli',
    '{"terms_reviewed":true,"eligibility_reviewed":true,"prize_conditions_reviewed":true,"data_processing_reviewed":true,"minors_reviewed":true}');
  update public.giveaway_campaigns set status = 'active' where slug = 'second';
  msg := public._t_err($q$update public.giveaway_campaigns set status = 'cancelled' where slug = 'second'$q$);
  if msg <> 'cancel_reason_required' then raise exception 'cancelling a published campaign needs a reason, got %', msg; end if;
  update public.giveaway_campaigns set status = 'cancelled', cancelled_reason = 'Campania a fost anulată de organizator.' where slug = 'second';
  msg := public._t_err($q$update public.giveaway_campaigns set status = 'active' where slug = 'second'$q$);
  if msg not like 'invalid_transition:%' then raise exception 'a cancelled campaign was reopened, got %', msg; end if;
  reset role;
  perform public._t_as('user_aaa');
  msg := public._t_err($q$select public.enter_giveaway('second', true, true)$q$);
  if msg <> 'cancelled' then raise exception 'entry on a cancelled campaign, got %', msg; end if;
  j := public.get_giveaway('second');
  if j ->> 'phase' <> 'cancelled' or j ->> 'cancelled_notice' is null then raise exception 'cancelled campaign page wrong: %', j; end if;
  reset role;

  -- ---------------------------------------------------------------- attribution and visits
  perform public._t_anon();
  perform public.track_giveaway_visit('molt-3d', 'plato_print', 'qr');
  perform public.track_giveaway_visit('molt-3d', 'plato_print', 'qr');
  perform public.track_giveaway_visit('molt-3d', 'not-a-source', 'qr'); -- counted as direct
  perform public.track_giveaway_visit('nope', 'plato_print', 'qr');     -- ignored
  reset role;
  perform public._t_as('user_aaa');
  j := public.claim_giveaway_attribution('molt-3d', 'plato_print', 'qr', now() - interval '1 hour');
  if (j ->> 'claimed')::boolean is not true then raise exception 'attribution not claimed: %', j; end if;
  j := public.claim_giveaway_attribution('molt-3d', 'poster', 'qr', now());
  if (j ->> 'claimed')::boolean then raise exception 'attribution is first-touch: a second claim was accepted'; end if;
  reset role;
  perform public._t_as('user_ccc');
  j := public.claim_giveaway_attribution('molt-3d', 'plato_print', 'qr', now() - interval '8 days');
  if (j ->> 'claimed')::boolean then raise exception 'an attribution older than 7 days was accepted'; end if;
  j := public.claim_giveaway_attribution('molt-3d', 'made_up', 'qr', now());
  if (j ->> 'claimed')::boolean then raise exception 'an unknown source was accepted'; end if;
  if not public._t_denied('select count(*) from public.giveaway_attributions') then raise exception 'LEAK: attributions readable by players'; end if;
  reset role;
  perform public._t_as('user_admin', adm);
  j := public.giveaway_stats(cid);
  if (select (x ->> 'visits')::int from jsonb_array_elements(j) x where x ->> 'source' = 'plato_print') <> 2 then raise exception 'visits wrong: %', j; end if;
  if (select (x ->> 'visits')::int from jsonb_array_elements(j) x where x ->> 'source' = 'direct') <> 1 then raise exception 'direct visits wrong: %', j; end if;
  if (select (x ->> 'claimed')::int from jsonb_array_elements(j) x where x ->> 'source' = 'plato_print') <> 1 then raise exception 'claims wrong: %', j; end if;
  if (select sum((x ->> 'entries')::int) from jsonb_array_elements(j) x) <> (select count(*) from public.giveaway_entries where campaign_id = cid and status = 'valid') then raise exception 'entries by source do not add up: %', j; end if;
  if (select (x ->> 'activated')::int from jsonb_array_elements(j) x where x ->> 'source' = 'plato_print') <> 0 then raise exception 'activated must not count players without check-ins: %', j; end if;
  reset role;
  perform public._t_as('user_aaa');
  msg := public._t_err('select public.giveaway_stats()');
  if msg <> 'forbidden' then raise exception 'a player read the stats, got %', msg; end if;
  reset role;

  -- ---------------------------------------------------------------- audit is admin-only
  perform public._t_as('user_admin', adm);
  select count(*) into n from public.giveaway_audit;
  if n < 8 then raise exception 'the audit trail is too short (%)', n; end if;
  reset role;
  perform public._t_as('user_aaa');
  select count(*) into n from public.giveaway_audit;
  if n <> 0 then raise exception 'LEAK: a player reads the audit trail'; end if;
  reset role;

  -- ---------------------------------------------------------------- deleting an account clears its giveaway data
  perform public._t_as('user_aaa');
  perform public.delete_my_account();
  reset role;
  select count(*) into n from public.giveaway_entries where user_id = 'user_aaa';
  if n <> 0 then raise exception 'entries survived account deletion'; end if;
  select count(*) into n from public.giveaway_attributions where user_id = 'user_aaa';
  if n <> 0 then raise exception 'attribution survived account deletion'; end if;
  select count(*) into n from public.giveaway_winners where campaign_id = cid;
  if n < 2 then raise exception 'winner audit rows must survive account deletion'; end if;

  raise notice 'giveaway checks passed';
end $$;

rollback;
