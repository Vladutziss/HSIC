-- Emails from Molted (onboarding nudge, retention, one reactivation). Design in docs/EMAILS.md.
--
-- * The email address lives in Clerk, not in the database. The app calls sync_email_profile() after sign-in and the
--   function reads the verified `email` claim of the session token (the same claim is_site_admin() trusts), so the
--   client cannot register somebody else's address. Users who have not signed in since this migration get their
--   address on their next visit.
-- * email_preferences is the source of truth for consent. Everybody starts opted in (marketing_enabled = true,
--   including the backfill below); the app, the unsubscribe page and the Resend webhook turn it off. Nothing here
--   is readable by the API roles: clients use the RPCs, the Edge Functions use the service role.
-- * email_log is the audit trail and the dedupe key: one row per (user, campaign, period). A second run of the
--   job cannot send the same email twice, because claiming a row is the only way to send.
--
-- Safe to rerun. Undo (also deletes the consent history, so only on a database nobody has used yet):
--   drop function if exists public.sync_email_profile(boolean), public.my_marketing_emails(),
--     public.set_marketing_emails(boolean), public.unsubscribe_by_token(text, text),
--     public.email_candidates(), public.claim_email_sends(jsonb, int);
--   drop table if exists public.email_log, public.email_preferences;

create table if not exists public.email_preferences (
  user_id text primary key references public.profiles (id) on delete cascade,
  email text check (email is null or email = lower(email)),
  marketing_enabled boolean not null default true,
  unsubscribe_token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  unsubscribed_at timestamptz,
  unsubscribe_source text check (unsubscribe_source in ('link', 'header', 'settings', 'signup', 'complaint', 'bounce', 'admin')),
  bounced_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_preferences_email_idx on public.email_preferences (email);

create table if not exists public.email_log (
  id bigint generated always as identity primary key,
  user_id text not null references public.profiles (id) on delete cascade,
  campaign_type text not null check (campaign_type in ('onboarding_nudge', 'retention', 'reactivation')),
  period_key text not null, -- 'once' for one-off campaigns, an ISO week ('2026-W43') for repeating ones
  template_version text not null,
  variant text not null default 'a',
  resend_email_id text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'bounced', 'complained', 'failed')),
  error text,
  sent_at timestamptz not null default now(),
  constraint email_log_dedupe unique (user_id, campaign_type, period_key)
);
create index if not exists email_log_user_idx on public.email_log (user_id, sent_at desc);
create index if not exists email_log_resend_idx on public.email_log (resend_email_id);

alter table public.email_preferences enable row level security;
alter table public.email_log enable row level security;
revoke all on public.email_preferences, public.email_log from anon, authenticated;

-- ------------------------------------------------------------ backfill: every existing account starts opted in
insert into public.email_preferences (user_id)
select p.id from public.profiles p
on conflict (user_id) do nothing;

-- ------------------------------------------------------------ client RPCs (signed-in user, own row only)

-- Called by the app after sign-in (at most once a day per device). Creates the row on the first call (p_marketing is
-- the choice made on the sign-up form, and counts only then), keeps the address and the "last seen" time fresh.
create or replace function public.sync_email_profile(p_marketing boolean default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
  mail constant text := lower(nullif(trim(auth.jwt() ->> 'email'), ''));
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.profiles where id = me) then return; end if;
  insert into public.email_preferences as e (user_id, email, marketing_enabled, unsubscribed_at, unsubscribe_source, last_active_at)
  values (
    me, mail, coalesce(p_marketing, true),
    case when p_marketing is false then now() end,
    case when p_marketing is false then 'signup' end,
    now()
  )
  on conflict (user_id) do update
  set email = coalesce(excluded.email, e.email),
      -- a new address starts clean: an old bounce says nothing about it
      bounced_at = case when excluded.email is not null and excluded.email is distinct from e.email then null else e.bounced_at end,
      last_active_at = now(),
      updated_at = now();
end $$;

create or replace function public.my_marketing_emails() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select e.marketing_enabled from public.email_preferences e where e.user_id = (select public.requesting_user_id())), true);
$$;

create or replace function public.set_marketing_emails(p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me constant text := (select public.requesting_user_id());
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.profiles where id = me) then return; end if;
  insert into public.email_preferences as e (user_id, marketing_enabled, unsubscribed_at, unsubscribe_source)
  values (me, p_enabled, case when not p_enabled then now() end, case when not p_enabled then 'settings' end)
  on conflict (user_id) do update
  set marketing_enabled = excluded.marketing_enabled,
      unsubscribed_at = case when excluded.marketing_enabled then null else now() end,
      unsubscribe_source = case when excluded.marketing_enabled then null else 'settings' end,
      updated_at = now();
end $$;

revoke execute on function public.sync_email_profile(boolean), public.my_marketing_emails(), public.set_marketing_emails(boolean)
  from public, anon;
grant execute on function public.sync_email_profile(boolean), public.my_marketing_emails(), public.set_marketing_emails(boolean)
  to authenticated;

-- ------------------------------------------------------------ service-role functions (Edge Functions only)

-- The unsubscribe link, the List-Unsubscribe POST and the Resend webhook all end here. Idempotent; the token is the
-- only credential, so an unknown token does nothing and says so.
create or replace function public.unsubscribe_by_token(p_token text, p_source text default 'link') returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  hit int;
begin
  if p_source not in ('link', 'header', 'complaint', 'bounce', 'admin') then raise exception 'bad source'; end if;
  update public.email_preferences
  set marketing_enabled = false,
      unsubscribed_at = coalesce(unsubscribed_at, now()),
      unsubscribe_source = case when marketing_enabled then p_source else unsubscribe_source end,
      updated_at = now()
  where unsubscribe_token = p_token;
  get diagnostics hit = row_count;
  return hit > 0;
end $$;

-- Everybody who could be emailed, with the activity facts the campaign rules need. The rules themselves live in
-- supabase/functions/_shared/campaigns-core.js (so they can be tested without a database).
create or replace function public.email_candidates()
returns table (
  user_id text, email text, token text, lang text, name text, onboarded boolean, signup_at timestamptz,
  last_active_at timestamptz, completions_total int, completions_7d int, completions_prev_7d int, habits int,
  last_email_at timestamptz, last_email_type text, emails_30d int, reactivation_sent_at timestamptz,
  onboarding_sent_at timestamptz, retention_sent_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    p.id, e.email, e.unsubscribe_token,
    case when p.settings -> 'prefs' ->> 'lang' = 'en' then 'en' else 'ro' end,
    left(split_part(trim(p.name), ' ', 1), 40),
    p.onboarded, p.created_at,
    greatest(
      p.created_at, e.last_active_at,
      (select max(c.day)::timestamptz from public.completions c where c.user_id = p.id),
      (select max(t.done_on)::timestamptz from public.todos t where t.user_id = p.id),
      (select max(r.at) from public.day_reviews r where r.user_id = p.id)
    ),
    (select count(*)::int from public.completions c where c.user_id = p.id),
    (select count(*)::int from public.completions c where c.user_id = p.id and c.day > current_date - 7),
    (select count(*)::int from public.completions c where c.user_id = p.id and c.day <= current_date - 7 and c.day > current_date - 14),
    (select count(*)::int from public.habits h where h.user_id = p.id and h.archived_at is null),
    (select max(l.sent_at) from public.email_log l where l.user_id = p.id and l.status <> 'failed'),
    (select l.campaign_type from public.email_log l where l.user_id = p.id and l.status <> 'failed' order by l.sent_at desc limit 1),
    (select count(*)::int from public.email_log l where l.user_id = p.id and l.status <> 'failed' and l.sent_at > now() - interval '30 days'),
    (select max(l.sent_at) from public.email_log l where l.user_id = p.id and l.status <> 'failed' and l.campaign_type = 'reactivation'),
    (select max(l.sent_at) from public.email_log l where l.user_id = p.id and l.status <> 'failed' and l.campaign_type = 'onboarding_nudge'),
    (select max(l.sent_at) from public.email_log l where l.user_id = p.id and l.status <> 'failed' and l.campaign_type = 'retention')
  from public.profiles p
  join public.email_preferences e on e.user_id = p.id
  where e.marketing_enabled and e.bounced_at is null and e.email is not null;
$$;

-- Claim the sends: inserts the log rows and returns only those that are still allowed right now. The preference, the
-- bounce flag and the minimum gap since the last email are checked HERE, in the statement that reserves the send,
-- not when the audience was built; a user who unsubscribed a second ago is not returned.
create or replace function public.claim_email_sends(p_items jsonb, p_min_gap_days int)
returns table (log_id bigint, user_id text, email text, token text, campaign_type text, period_key text, variant text, template_version text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with items as (
    select i ->> 'user_id' as uid, i ->> 'campaign_type' as ctype, i ->> 'period_key' as pkey,
           coalesce(i ->> 'variant', 'a') as var, i ->> 'template_version' as tv
    from jsonb_array_elements(p_items) i
  ), allowed as (
    select it.*, e.email as mail, e.unsubscribe_token as tok
    from items it
    join public.email_preferences e on e.user_id = it.uid
    where e.marketing_enabled and e.bounced_at is null and e.email is not null
      and not exists (
        select 1 from public.email_log l
        where l.user_id = it.uid and l.status <> 'failed' and l.sent_at > now() - make_interval(days => p_min_gap_days)
      )
  ), ins as (
    insert into public.email_log as l (user_id, campaign_type, period_key, template_version, variant)
    select a.uid, a.ctype, a.pkey, a.tv, a.var from allowed a
    on conflict on constraint email_log_dedupe
    do update set status = 'pending', error = null, sent_at = now(), template_version = excluded.template_version, variant = excluded.variant
      where l.status = 'failed'
    returning l.id, l.user_id, l.campaign_type, l.period_key, l.variant, l.template_version
  )
  select ins.id, ins.user_id, a.mail, a.tok, ins.campaign_type, ins.period_key, ins.variant, ins.template_version
  from ins join allowed a on a.uid = ins.user_id and a.ctype = ins.campaign_type and a.pkey = ins.period_key;
end $$;

revoke execute on function public.unsubscribe_by_token(text, text), public.email_candidates(), public.claim_email_sends(jsonb, int)
  from public, anon, authenticated;
grant execute on function public.unsubscribe_by_token(text, text), public.email_candidates(), public.claim_email_sends(jsonb, int)
  to service_role;
