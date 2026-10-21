-- Giveaway campaigns (Romania only). Admin-managed, database-driven, no code deploy to open or close one.
--
-- * Admins are the site admins of 0012 (public.is_site_admin(): a verified email in public.site_admins). They write
--   campaigns, partners and sources straight into the tables (RLS); everything that decides something about a *player*
--   (entering, drawing a winner, attribution) goes through security-definer functions, never through a client write.
-- * The public never reads the tables. It calls get_giveaways() / get_giveaway(slug), which return only public fields.
-- * Whether a campaign is open is decided here, from the stored status and the server clock (giveaway_phase), never by
--   the frontend. A trigger enforces the lifecycle and the publish checklist.
-- * Winners: drawn on the server (random order by a strong random uuid), every step is written to giveaway_audit.
-- * Attribution model: first touch per player per campaign, valid for 7 days after the visit. See docs/GIVEAWAYS.md.
-- Safe to read top to bottom; run once (the objects are created, not replaced, except the functions).

-- ------------------------------------------------------------ vocab (kept in sync with packages/ui/giveaway-core.js)
-- sources: plato_print, plao_streetball, poster, event, social, referral
-- media:   qr, link, print, social

-- ------------------------------------------------------------ partners
create table public.giveaway_partners (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500), -- approved copy only
  logo_url text check (logo_url is null or logo_url ~ '^https://'),
  website text check (website is null or website ~ '^https://'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------ campaigns
create table public.giveaway_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  internal_name text not null check (char_length(internal_name) between 1 and 120),
  title text not null default '' check (char_length(title) <= 120),            -- public, Romanian
  description text not null default '' check (char_length(description) <= 2000),
  prize_name text not null default '' check (char_length(prize_name) <= 120),
  prize_description text not null default '' check (char_length(prize_description) <= 1000),
  prize_image_url text check (prize_image_url is null or prize_image_url ~ '^https://'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Europe/Bucharest' check (char_length(timezone) between 3 and 60),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled')),
  paused_visibility text not null default 'visible' check (paused_visibility in ('visible', 'hidden')),
  -- supported conditions only: requireOnboarded (bool), minCheckins (0..100), requireAttestation (bool, default true)
  eligibility jsonb not null default '{"requireOnboarded": true, "minCheckins": 0, "requireAttestation": true}'
    check (jsonb_typeof(eligibility) = 'object'),
  terms text not null default '' check (char_length(terms) <= 20000),           -- the official rules, written by the organizer
  landing jsonb not null default '{}' check (jsonb_typeof(landing) = 'object'), -- optional: {"cta": "...", "how_to": ["..."]}
  max_entries int check (max_entries is null or max_entries > 0),
  winner_count int not null default 1 check (winner_count between 1 and 50),
  -- the organizer's pre-publication review (all true before the campaign can leave draft)
  checklist jsonb not null default '{}' check (jsonb_typeof(checklist) = 'object'),
  internal_notes text not null default '' check (char_length(internal_notes) <= 2000),
  created_by text,
  published_at timestamptz,
  cancelled_reason text check (cancelled_reason is null or char_length(cancelled_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint giveaway_window check (ends_at > starts_at)
);

create table public.giveaway_campaign_partners (
  campaign_id uuid not null references public.giveaway_campaigns on delete cascade,
  partner_id uuid not null references public.giveaway_partners on delete restrict,
  primary key (campaign_id, partner_id)
);

-- trackable destinations (the QR codes): one row per source/medium a campaign is promoted through
create table public.giveaway_sources (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.giveaway_campaigns on delete cascade,
  source text not null check (source in ('plato_print', 'plao_streetball', 'poster', 'event', 'social', 'referral')),
  medium text not null default 'qr' check (medium in ('qr', 'link', 'print', 'social')),
  label text not null default '' check (char_length(label) <= 80),
  partner_id uuid references public.giveaway_partners on delete set null,
  created_at timestamptz not null default now(),
  unique (campaign_id, source, medium)
);

-- ------------------------------------------------------------ entries
create table public.giveaway_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.giveaway_campaigns on delete cascade,
  user_id text not null references public.profiles on delete cascade,
  status text not null default 'valid' check (status in ('valid', 'disqualified')),
  eligibility jsonb not null default '{}',   -- what was checked and passed at entry time
  rules_accepted_at timestamptz not null,
  attested_at timestamptz,
  source text check (source is null or source in ('plato_print', 'plao_streetball', 'poster', 'event', 'social', 'referral')),
  medium text check (medium is null or medium in ('qr', 'link', 'print', 'social')),
  disqualified_reason text check (disqualified_reason is null or char_length(disqualified_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, user_id)               -- one entry per player per campaign, enforced here
);
create index giveaway_entries_campaign on public.giveaway_entries (campaign_id, status);

-- ------------------------------------------------------------ attribution and visits
-- visits: anonymous counters, no identifier of any kind (so "unique visitors" are not measurable and are not claimed)
create table public.giveaway_events (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.giveaway_campaigns on delete cascade,
  source text not null,
  medium text not null,
  at timestamptz not null default now()
);
create index giveaway_events_campaign on public.giveaway_events (campaign_id, source, at);

-- one row per player per campaign: the source that brought them (first touch within 7 days of the visit)
create table public.giveaway_attributions (
  campaign_id uuid not null references public.giveaway_campaigns on delete cascade,
  user_id text not null,                       -- no FK: it can be claimed before the profile exists; delete_my_account clears it
  source text not null check (source in ('plato_print', 'plao_streetball', 'poster', 'event', 'social', 'referral')),
  medium text not null check (medium in ('qr', 'link', 'print', 'social')),
  first_visit_at timestamptz not null,
  claimed_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

-- ------------------------------------------------------------ winners and fulfillment (internal)
create table public.giveaway_winners (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.giveaway_campaigns on delete cascade,
  entry_id uuid references public.giveaway_entries on delete set null, -- the player can delete their account
  selection_method text not null check (selection_method in ('random_draw', 'manual')),
  selected_at timestamptz not null default now(),
  selected_by text,
  audit jsonb not null default '{}',
  status text not null default 'selected' check (status in ('selected', 'notified', 'confirmed', 'declined', 'voided')),
  notified_at timestamptz,
  fulfillment_status text not null default 'pending' check (fulfillment_status in ('pending', 'arranged', 'delivered', 'failed')),
  fulfilled_at timestamptz,
  admin_notes text not null default '' check (char_length(admin_notes) <= 1000),   -- never public
  public_label text check (public_label is null or char_length(public_label) between 1 and 40), -- written by an admin
  announced_at timestamptz,
  voided_at timestamptz,
  void_reason text check (void_reason is null or char_length(void_reason) <= 300)
);
create index giveaway_winners_campaign on public.giveaway_winners (campaign_id);
create unique index giveaway_winners_entry on public.giveaway_winners (entry_id) where entry_id is not null and status <> 'voided';

-- ------------------------------------------------------------ audit trail (append-only, admins read)
create table public.giveaway_audit (
  id bigint generated always as identity primary key,
  campaign_id uuid references public.giveaway_campaigns on delete set null,
  actor text,
  action text not null,
  details jsonb not null default '{}',
  at timestamptz not null default now()
);
create index giveaway_audit_campaign on public.giveaway_audit (campaign_id, at desc);

-- ------------------------------------------------------------ RLS
alter table public.giveaway_partners enable row level security;
alter table public.giveaway_campaigns enable row level security;
alter table public.giveaway_campaign_partners enable row level security;
alter table public.giveaway_sources enable row level security;
alter table public.giveaway_entries enable row level security;
alter table public.giveaway_events enable row level security;
alter table public.giveaway_attributions enable row level security;
alter table public.giveaway_winners enable row level security;
alter table public.giveaway_audit enable row level security;

revoke all on public.giveaway_partners, public.giveaway_campaigns, public.giveaway_campaign_partners, public.giveaway_sources,
  public.giveaway_entries, public.giveaway_events, public.giveaway_attributions, public.giveaway_winners, public.giveaway_audit
  from anon, authenticated;

-- admins: manage partners, campaigns (delete only while draft), the partner links and the sources
create policy giveaway_partners_admin on public.giveaway_partners for all to authenticated
  using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy giveaway_campaigns_admin_select on public.giveaway_campaigns for select to authenticated using ((select public.is_site_admin()));
create policy giveaway_campaigns_admin_insert on public.giveaway_campaigns for insert to authenticated with check ((select public.is_site_admin()));
create policy giveaway_campaigns_admin_update on public.giveaway_campaigns for update to authenticated
  using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy giveaway_campaigns_admin_delete on public.giveaway_campaigns for delete to authenticated
  using ((select public.is_site_admin()) and status = 'draft');
create policy giveaway_campaign_partners_admin on public.giveaway_campaign_partners for all to authenticated
  using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy giveaway_sources_admin on public.giveaway_sources for all to authenticated
  using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
grant select, insert, update, delete on public.giveaway_partners, public.giveaway_campaign_partners, public.giveaway_sources to authenticated;
grant select, insert, update, delete on public.giveaway_campaigns to authenticated;

-- entries: a player reads only their own, admins read all; nobody writes them directly (enter_giveaway / admin functions)
create policy giveaway_entries_select on public.giveaway_entries for select to authenticated
  using (user_id = (select public.requesting_user_id()) or (select public.is_site_admin()));
grant select on public.giveaway_entries to authenticated;

-- winners and audit: admins read; all writes go through functions
create policy giveaway_winners_admin_select on public.giveaway_winners for select to authenticated using ((select public.is_site_admin()));
create policy giveaway_audit_admin_select on public.giveaway_audit for select to authenticated using ((select public.is_site_admin()));
grant select on public.giveaway_winners, public.giveaway_audit to authenticated;
-- giveaway_events and giveaway_attributions: no policies, no grants: only the functions below touch them

-- ------------------------------------------------------------ helpers
-- The state a campaign is really in right now: status plus the clock.
-- scheduled|active -> scheduled before starts_at, active inside the window, ended after ends_at.
create function public.giveaway_phase(c public.giveaway_campaigns, at timestamptz default now()) returns text
language sql stable set search_path = '' as $$
  select case
    when c.status in ('draft', 'paused', 'completed', 'cancelled') then c.status
    when at < c.starts_at then 'scheduled'
    when at >= c.ends_at then 'ended'
    else 'active'
  end;
$$;
revoke execute on function public.giveaway_phase(public.giveaway_campaigns, timestamptz) from public, anon;
grant execute on function public.giveaway_phase(public.giveaway_campaigns, timestamptz) to authenticated;

create function public.log_giveaway(p_campaign uuid, p_action text, p_details jsonb default '{}') returns void
language sql security definer set search_path = '' as $$
  insert into public.giveaway_audit (campaign_id, actor, action, details)
  values (p_campaign, (select public.requesting_user_id()), p_action, coalesce(p_details, '{}'));
$$;
revoke execute on function public.log_giveaway(uuid, text, jsonb) from public, anon, authenticated;

create function public.giveaway_require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select public.is_site_admin()) then raise exception 'forbidden'; end if;
end $$;
revoke execute on function public.giveaway_require_admin() from public, anon, authenticated;

-- ------------------------------------------------------------ lifecycle guard
create function public.giveaway_campaign_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  keys constant text[] := array['terms_reviewed', 'eligibility_reviewed', 'prize_conditions_reviewed', 'data_processing_reviewed', 'minors_reviewed'];
  k text;
  has_entries boolean;
  ok boolean;
begin
  new.updated_at := now();
  new.title := btrim(new.title);

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'new_campaign_must_be_draft'; end if;
    new.created_by := (select public.requesting_user_id());
    new.published_at := null;
    return new;
  end if;

  -- immutable once published: the slug is in printed QR codes
  if new.slug <> old.slug and old.published_at is not null then raise exception 'slug_locked'; end if;
  if new.id <> old.id then raise exception 'id_locked'; end if;
  new.created_by := old.created_by;
  new.published_at := old.published_at;

  -- eligibility cannot change under people who already entered
  if new.eligibility is distinct from old.eligibility then
    select exists (select 1 from public.giveaway_entries e where e.campaign_id = old.id) into has_entries;
    if has_entries then raise exception 'eligibility_locked'; end if;
  end if;

  if new.status is distinct from old.status then
    ok := case old.status
      when 'draft' then new.status in ('scheduled', 'active', 'cancelled')
      when 'scheduled' then new.status in ('active', 'paused', 'cancelled')
      when 'active' then new.status in ('paused', 'completed', 'cancelled')
      when 'paused' then new.status in ('active', 'completed', 'cancelled')
      else false
    end;
    if not ok then raise exception 'invalid_transition:%->%', old.status, new.status; end if;

    if old.status = 'draft' and new.status <> 'cancelled' then
      -- publishing: every public field filled, dates in the future, the organizer's checklist ticked
      if new.title = '' or new.description = '' or new.prize_name = '' or btrim(new.terms) = '' then raise exception 'incomplete_campaign'; end if;
      if new.ends_at <= now() then raise exception 'ends_in_the_past'; end if;
      foreach k in array keys loop
        if coalesce(new.checklist ->> k, 'false') <> 'true' then raise exception 'checklist_incomplete:%', k; end if;
      end loop;
      new.published_at := now();
    end if;
    if new.status = 'cancelled' and coalesce(btrim(new.cancelled_reason), '') = '' and old.published_at is not null then
      raise exception 'cancel_reason_required';
    end if;
  end if;
  return new;
end $$;
create trigger giveaway_campaign_guard before insert or update on public.giveaway_campaigns
  for each row execute function public.giveaway_campaign_guard();

create function public.giveaway_campaign_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_giveaway(new.id, 'campaign_created', jsonb_build_object('slug', new.slug));
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      perform public.log_giveaway(new.id, 'status_changed', jsonb_build_object('from', old.status, 'to', new.status, 'reason', new.cancelled_reason));
    elsif to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
      perform public.log_giveaway(new.id, 'campaign_edited', '{}');
    end if;
  else
    perform public.log_giveaway(null, 'campaign_deleted', jsonb_build_object('slug', old.slug));
  end if;
  return coalesce(new, old);
end $$;
create trigger giveaway_campaign_audit after insert or update or delete on public.giveaway_campaigns
  for each row execute function public.giveaway_campaign_audit();

-- ------------------------------------------------------------ public reads
-- The public JSON of one campaign (never internal_name, notes, checklist, creator, counts).
create function public.giveaway_public_json(c public.giveaway_campaigns, me text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  ph text := public.giveaway_phase(c);
  entry_row public.giveaway_entries;
  n int;
  full_ boolean := false;
begin
  if c.max_entries is not null then
    select count(*) into n from public.giveaway_entries e where e.campaign_id = c.id and e.status = 'valid';
    full_ := n >= c.max_entries;
  end if;
  if me is not null then
    select * into entry_row from public.giveaway_entries e where e.campaign_id = c.id and e.user_id = me;
  end if;
  return jsonb_build_object(
    'found', true,
    'slug', c.slug,
    'title', c.title,
    'description', c.description,
    'prize', jsonb_build_object('name', c.prize_name, 'description', c.prize_description, 'image_url', c.prize_image_url),
    'starts_at', c.starts_at,
    'ends_at', c.ends_at,
    'timezone', c.timezone,
    'phase', ph,
    'entries_open', ph = 'active' and not full_,
    'full', full_,
    'eligibility', jsonb_build_object(
      'requireOnboarded', coalesce((c.eligibility ->> 'requireOnboarded')::boolean, false),
      'minCheckins', coalesce((c.eligibility ->> 'minCheckins')::int, 0),
      'requireAttestation', coalesce((c.eligibility ->> 'requireAttestation')::boolean, true)),
    'terms', c.terms,
    'landing', c.landing,
    'cancelled_notice', case when c.status = 'cancelled' then c.cancelled_reason end,
    'partners', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'description', p.description, 'logo_url', p.logo_url, 'website', p.website) order by p.name)
      from public.giveaway_campaign_partners cp join public.giveaway_partners p on p.id = cp.partner_id
      where cp.campaign_id = c.id and p.active), '[]'),
    'winners', coalesce((
      select jsonb_agg(w.public_label order by w.announced_at)
      from public.giveaway_winners w where w.campaign_id = c.id and w.announced_at is not null and w.status <> 'voided' and w.public_label is not null), '[]'),
    'me', case when me is null then null else jsonb_build_object('entered', entry_row.id is not null, 'status', entry_row.status) end
  );
end $$;
revoke execute on function public.giveaway_public_json(public.giveaway_campaigns, text) from public, anon, authenticated;

create function public.get_giveaways() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me text := (select public.requesting_user_id());
begin
  return coalesce((
    select jsonb_agg(public.giveaway_public_json(c, me)
      order by case public.giveaway_phase(c) when 'active' then 0 when 'scheduled' then 1 when 'paused' then 2 else 3 end, c.ends_at)
    from public.giveaway_campaigns c
    where c.published_at is not null and c.status <> 'draft' and c.status <> 'cancelled'
      and not (c.status = 'paused' and c.paused_visibility = 'hidden')), '[]');
end $$;

create function public.get_giveaway(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.giveaway_campaigns;
  me text := (select public.requesting_user_id());
begin
  select * into c from public.giveaway_campaigns x where x.slug = lower(coalesce(p_slug, '')) and x.published_at is not null and x.status <> 'draft';
  if c.id is null then return jsonb_build_object('found', false); end if;
  -- a hidden paused campaign still answers (a QR code must not break) but shows nothing but its status
  if c.status = 'paused' and c.paused_visibility = 'hidden' then
    return jsonb_build_object('found', true, 'slug', c.slug, 'title', c.title, 'phase', 'paused', 'entries_open', false, 'hidden', true);
  end if;
  return public.giveaway_public_json(c, me);
end $$;

revoke execute on function public.get_giveaways(), public.get_giveaway(text) from public;
grant execute on function public.get_giveaways(), public.get_giveaway(text) to anon, authenticated;

-- a page view from a QR code or link: an anonymous counter, nothing identifying is stored
create function public.track_giveaway_visit(p_slug text, p_source text, p_medium text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
  src text := case when p_source in ('plato_print', 'plao_streetball', 'poster', 'event', 'social', 'referral') then p_source else 'direct' end;
  med text := case when p_medium in ('qr', 'link', 'print', 'social') then p_medium else 'link' end;
begin
  select id into cid from public.giveaway_campaigns where slug = lower(coalesce(p_slug, '')) and published_at is not null and status <> 'draft';
  if cid is null then return; end if;
  -- crude flood guard: at most 300 counted visits per campaign and minute
  if (select count(*) from public.giveaway_events where campaign_id = cid and at > now() - interval '1 minute') >= 300 then return; end if;
  insert into public.giveaway_events (campaign_id, source, medium) values (cid, src, med);
end $$;
revoke execute on function public.track_giveaway_visit(text, text, text) from public;
grant execute on function public.track_giveaway_visit(text, text, text) to anon, authenticated;

-- ------------------------------------------------------------ signed-in actions
-- First-touch attribution: the visit's source is attached to the account the first time it signs in (within 7 days).
create function public.claim_giveaway_attribution(p_slug text, p_source text, p_medium text, p_visited_at timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me text := (select public.requesting_user_id());
  cid uuid;
  visited timestamptz;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if p_source not in ('plato_print', 'plao_streetball', 'poster', 'event', 'social', 'referral') then return jsonb_build_object('claimed', false); end if;
  if p_medium not in ('qr', 'link', 'print', 'social') then return jsonb_build_object('claimed', false); end if;
  select id into cid from public.giveaway_campaigns where slug = lower(coalesce(p_slug, '')) and published_at is not null and status <> 'draft';
  if cid is null then return jsonb_build_object('claimed', false); end if;
  visited := least(coalesce(p_visited_at, now()), now());
  if visited < now() - interval '7 days' then return jsonb_build_object('claimed', false); end if;
  insert into public.giveaway_attributions (campaign_id, user_id, source, medium, first_visit_at)
  values (cid, me, p_source, p_medium, visited) on conflict do nothing;
  return jsonb_build_object('claimed', found);
end $$;
revoke execute on function public.claim_giveaway_attribution(text, text, text, timestamptz) from public, anon;
grant execute on function public.claim_giveaway_attribution(text, text, text, timestamptz) to authenticated;

-- Enter a campaign. Every rule is checked here; the client only shows what this answers.
-- Errors (the message is a stable code): not_authenticated, not_found, not_started, paused, ended, cancelled, full,
-- no_profile, rules_not_accepted, attestation_required, not_onboarded, not_enough_checkins.
create function public.enter_giveaway(p_slug text, p_accept_rules boolean, p_attest boolean, p_source text default null, p_medium text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me text := (select public.requesting_user_id());
  c public.giveaway_campaigns;
  ph text;
  prof public.profiles;
  existing uuid;
  need_onboarded boolean;
  need_checkins int;
  need_attest boolean;
  have_checkins int;
  total int;
  src text := case when p_source in ('plato_print', 'plao_streetball', 'poster', 'event', 'social', 'referral') then p_source end;
  med text := case when p_medium in ('qr', 'link', 'print', 'social') then p_medium end;
  new_id uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  select * into c from public.giveaway_campaigns x where x.slug = lower(coalesce(p_slug, '')) and x.published_at is not null and x.status <> 'draft';
  if c.id is null then raise exception 'not_found'; end if;

  -- serialize entries per campaign so the cap and the duplicate rule hold under concurrency
  perform pg_advisory_xact_lock(hashtextextended(c.id::text, 0));

  select id into existing from public.giveaway_entries e where e.campaign_id = c.id and e.user_id = me;
  if existing is not null then return jsonb_build_object('status', 'already_entered', 'entry_id', existing); end if;

  ph := public.giveaway_phase(c);
  if ph = 'scheduled' then raise exception 'not_started'; end if;
  if ph = 'paused' then raise exception 'paused'; end if;
  if ph in ('ended', 'completed') then raise exception 'ended'; end if;
  if ph = 'cancelled' then raise exception 'cancelled'; end if;

  select * into prof from public.profiles p where p.id = me;
  if prof.id is null then raise exception 'no_profile'; end if;
  if not coalesce(p_accept_rules, false) then raise exception 'rules_not_accepted'; end if;

  need_onboarded := coalesce((c.eligibility ->> 'requireOnboarded')::boolean, false);
  need_checkins := coalesce((c.eligibility ->> 'minCheckins')::int, 0);
  need_attest := coalesce((c.eligibility ->> 'requireAttestation')::boolean, true);

  if need_attest and not coalesce(p_attest, false) then raise exception 'attestation_required'; end if;
  if need_onboarded and not prof.onboarded then raise exception 'not_onboarded'; end if;
  if need_checkins > 0 then
    select count(*) into have_checkins from public.completions where user_id = me;
    if have_checkins < need_checkins then raise exception 'not_enough_checkins' using detail = (need_checkins - have_checkins)::text; end if;
  end if;

  if c.max_entries is not null then
    select count(*) into total from public.giveaway_entries e where e.campaign_id = c.id and e.status = 'valid';
    if total >= c.max_entries then raise exception 'full'; end if;
  end if;

  insert into public.giveaway_entries (campaign_id, user_id, eligibility, rules_accepted_at, attested_at, source, medium)
  values (c.id, me, jsonb_build_object('requireOnboarded', need_onboarded, 'minCheckins', need_checkins, 'requireAttestation', need_attest),
          now(), case when need_attest then now() end, src, med)
  returning id into new_id;
  return jsonb_build_object('status', 'entered', 'entry_id', new_id);
end $$;
revoke execute on function public.enter_giveaway(text, boolean, boolean, text, text) from public, anon;
grant execute on function public.enter_giveaway(text, boolean, boolean, text, text) to authenticated;

-- ------------------------------------------------------------ admin: entries, winners
create function public.disqualify_giveaway_entry(p_entry uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.giveaway_entries;
begin
  perform public.giveaway_require_admin();
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required'; end if;
  update public.giveaway_entries set status = 'disqualified', disqualified_reason = btrim(p_reason), updated_at = now()
    where id = p_entry returning * into e;
  if e.id is null then raise exception 'not_found'; end if;
  -- an active winner whose entry is disqualified is voided
  update public.giveaway_winners set status = 'voided', voided_at = now(), void_reason = 'entry disqualified: ' || btrim(p_reason)
    where entry_id = p_entry and status <> 'voided';
  perform public.log_giveaway(e.campaign_id, 'entry_disqualified', jsonb_build_object('entry_id', p_entry, 'reason', btrim(p_reason)));
end $$;

-- Drawing is only allowed once entries are closed (ended or completed), never for draft, running, paused or cancelled campaigns.
create function public.draw_giveaway_winner(p_campaign uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.giveaway_campaigns;
  ph text;
  pool int;
  active_winners int;
  picked uuid;
  wid uuid;
  digest text;
begin
  perform public.giveaway_require_admin();
  select * into c from public.giveaway_campaigns where id = p_campaign for update;
  if c.id is null then raise exception 'not_found'; end if;
  ph := public.giveaway_phase(c);
  if ph not in ('ended', 'completed') then raise exception 'draw_not_allowed:%', ph; end if;
  select count(*) into active_winners from public.giveaway_winners where campaign_id = c.id and status <> 'voided';
  if active_winners >= c.winner_count then raise exception 'winners_complete'; end if;

  select count(*), md5(coalesce(string_agg(e.id::text, ',' order by e.id), ''))
    into pool, digest
    from public.giveaway_entries e
    where e.campaign_id = c.id and e.status = 'valid'
      and not exists (select 1 from public.giveaway_winners w where w.entry_id = e.id);
  if pool = 0 then raise exception 'no_eligible_entries'; end if;

  -- uniform random choice by a strong random uuid per row (server side; nothing the client sends influences it)
  select e.id into picked
    from public.giveaway_entries e
    where e.campaign_id = c.id and e.status = 'valid'
      and not exists (select 1 from public.giveaway_winners w where w.entry_id = e.id)
    order by gen_random_uuid() limit 1;

  insert into public.giveaway_winners (campaign_id, entry_id, selection_method, selected_by, audit)
  values (c.id, picked, 'random_draw', (select public.requesting_user_id()),
          jsonb_build_object('pool_size', pool, 'pool_digest_md5', digest, 'method', 'order by gen_random_uuid()', 'phase', ph))
  returning id into wid;
  perform public.log_giveaway(c.id, 'winner_drawn', jsonb_build_object('winner_id', wid, 'pool_size', pool, 'pool_digest_md5', digest));
  return jsonb_build_object('winner_id', wid, 'pool_size', pool);
end $$;

create function public.select_giveaway_winner_manual(p_campaign uuid, p_entry uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.giveaway_campaigns;
  ph text;
  active_winners int;
  wid uuid;
begin
  perform public.giveaway_require_admin();
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'reason_required'; end if;
  select * into c from public.giveaway_campaigns where id = p_campaign for update;
  if c.id is null then raise exception 'not_found'; end if;
  ph := public.giveaway_phase(c);
  if ph not in ('ended', 'completed') then raise exception 'draw_not_allowed:%', ph; end if;
  select count(*) into active_winners from public.giveaway_winners where campaign_id = c.id and status <> 'voided';
  if active_winners >= c.winner_count then raise exception 'winners_complete'; end if;
  if not exists (select 1 from public.giveaway_entries e where e.id = p_entry and e.campaign_id = c.id and e.status = 'valid') then raise exception 'entry_not_eligible'; end if;
  insert into public.giveaway_winners (campaign_id, entry_id, selection_method, selected_by, audit)
  values (c.id, p_entry, 'manual', (select public.requesting_user_id()), jsonb_build_object('reason', btrim(p_reason), 'phase', ph))
  returning id into wid;
  perform public.log_giveaway(c.id, 'winner_selected_manually', jsonb_build_object('winner_id', wid, 'reason', btrim(p_reason)));
  return jsonb_build_object('winner_id', wid);
end $$;

create function public.void_giveaway_winner(p_winner uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare w public.giveaway_winners;
begin
  perform public.giveaway_require_admin();
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'reason_required'; end if;
  update public.giveaway_winners set status = 'voided', voided_at = now(), void_reason = btrim(p_reason), announced_at = null
    where id = p_winner and status <> 'voided' returning * into w;
  if w.id is null then raise exception 'not_found'; end if;
  perform public.log_giveaway(w.campaign_id, 'winner_voided', jsonb_build_object('winner_id', p_winner, 'reason', btrim(p_reason)));
end $$;

-- notification and fulfillment bookkeeping (internal; announcing is a separate, explicit step)
create function public.update_giveaway_winner(p_winner uuid, p_status text, p_fulfillment text, p_notes text) returns void
language plpgsql security definer set search_path = '' as $$
declare w public.giveaway_winners;
begin
  perform public.giveaway_require_admin();
  if p_status not in ('selected', 'notified', 'confirmed', 'declined') then raise exception 'invalid_status'; end if;
  if p_fulfillment not in ('pending', 'arranged', 'delivered', 'failed') then raise exception 'invalid_status'; end if;
  select * into w from public.giveaway_winners where id = p_winner;
  if w.id is null or w.status = 'voided' then raise exception 'not_found'; end if;
  update public.giveaway_winners set
    status = p_status,
    notified_at = case when p_status in ('notified', 'confirmed', 'declined') then coalesce(notified_at, now()) else notified_at end,
    fulfillment_status = p_fulfillment,
    fulfilled_at = case when p_fulfillment = 'delivered' then coalesce(fulfilled_at, now()) else null end,
    admin_notes = coalesce(left(p_notes, 1000), '')
    where id = p_winner;
  perform public.log_giveaway(w.campaign_id, 'winner_updated', jsonb_build_object('winner_id', p_winner, 'status', p_status, 'fulfillment', p_fulfillment));
end $$;

-- the only way a winner becomes public: an admin writes the label (for example "Andrei P.") and announces it
create function public.announce_giveaway_winner(p_winner uuid, p_label text) returns void
language plpgsql security definer set search_path = '' as $$
declare w public.giveaway_winners;
begin
  perform public.giveaway_require_admin();
  if char_length(btrim(coalesce(p_label, ''))) not between 1 and 40 then raise exception 'label_required'; end if;
  update public.giveaway_winners set public_label = btrim(p_label), announced_at = now()
    where id = p_winner and status <> 'voided' returning * into w;
  if w.id is null then raise exception 'not_found'; end if;
  perform public.log_giveaway(w.campaign_id, 'winner_announced', jsonb_build_object('winner_id', p_winner));
end $$;

revoke execute on function public.disqualify_giveaway_entry(uuid, text), public.draw_giveaway_winner(uuid),
  public.select_giveaway_winner_manual(uuid, uuid, text), public.void_giveaway_winner(uuid, text),
  public.update_giveaway_winner(uuid, text, text, text), public.announce_giveaway_winner(uuid, text) from public, anon;
grant execute on function public.disqualify_giveaway_entry(uuid, text), public.draw_giveaway_winner(uuid),
  public.select_giveaway_winner_manual(uuid, uuid, text), public.void_giveaway_winner(uuid, text),
  public.update_giveaway_winner(uuid, text, text, text), public.announce_giveaway_winner(uuid, text) to authenticated;

-- ------------------------------------------------------------ admin: aggregate funnel
-- Per campaign and source. Definitions (docs/GIVEAWAYS.md):
--   visits      counted page views carrying that source (anonymous; not unique visitors)
--   claimed     accounts that signed in after such a visit (first touch, within 7 days)
--   registered  claimed accounts whose profile was created after that visit (new players, not existing ones)
--   activated   registered accounts with at least one habit check-in on or after the visit day
--   returning   registered accounts with check-ins on at least two different days since the visit
--   entries     valid entries recorded with that source
create function public.giveaway_stats(p_campaign uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.giveaway_require_admin();
  return coalesce((
    select jsonb_agg(row_to_json(t) order by t.campaign_slug, t.source)
    from (
      select c.id as campaign_id, c.slug as campaign_slug, c.internal_name as campaign_name, s.source,
        (select count(*) from public.giveaway_events v where v.campaign_id = c.id and v.source = s.source) as visits,
        (select count(*) from public.giveaway_attributions a where a.campaign_id = c.id and a.source = s.source) as claimed,
        (select count(*) from public.giveaway_attributions a join public.profiles p on p.id = a.user_id
           where a.campaign_id = c.id and a.source = s.source and p.created_at >= a.first_visit_at) as registered,
        (select count(*) from public.giveaway_attributions a join public.profiles p on p.id = a.user_id
           where a.campaign_id = c.id and a.source = s.source and p.created_at >= a.first_visit_at
             and exists (select 1 from public.completions k where k.user_id = a.user_id and k.day >= a.first_visit_at::date)) as activated,
        (select count(*) from public.giveaway_attributions a join public.profiles p on p.id = a.user_id
           where a.campaign_id = c.id and a.source = s.source and p.created_at >= a.first_visit_at
             and (select count(distinct k.day) from public.completions k where k.user_id = a.user_id and k.day >= a.first_visit_at::date) >= 2) as returning_users,
        (select count(*) from public.giveaway_entries e where e.campaign_id = c.id and e.status = 'valid' and e.source = s.source) as entries
      from public.giveaway_campaigns c
      cross join (values ('plato_print'), ('plao_streetball'), ('poster'), ('event'), ('social'), ('referral'), ('direct')) as s(source)
      where (p_campaign is null or c.id = p_campaign)
        and (exists (select 1 from public.giveaway_events v where v.campaign_id = c.id and v.source = s.source)
          or exists (select 1 from public.giveaway_attributions a where a.campaign_id = c.id and a.source = s.source)
          or exists (select 1 from public.giveaway_entries e where e.campaign_id = c.id and e.source = s.source))
    ) t), '[]');
end $$;
revoke execute on function public.giveaway_stats(uuid) from public, anon;
grant execute on function public.giveaway_stats(uuid) to authenticated;

-- ------------------------------------------------------------ account deletion also clears attribution
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare me text := (select public.requesting_user_id());
begin
  if me is null then raise exception 'not authenticated'; end if;
  delete from public.giveaway_attributions where user_id = me;
  delete from public.profiles where id = me; -- entries cascade; winner rows keep their audit with entry_id set to null
end $$;

-- ------------------------------------------------------------ images (prize photos, partner logos)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('giveaways', 'giveaways', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy giveaway_files_select on storage.objects for select to authenticated
  using (bucket_id = 'giveaways' and (select public.is_site_admin()));
create policy giveaway_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'giveaways' and (select public.is_site_admin()));
create policy giveaway_files_update on storage.objects for update to authenticated
  using (bucket_id = 'giveaways' and (select public.is_site_admin()));
create policy giveaway_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'giveaways' and (select public.is_site_admin()));
