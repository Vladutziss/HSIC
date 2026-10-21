-- Email campaigns, second cut: retention becomes a sequence (first-tick nudge, quick win, feature tour, feedback) and
-- reactivation stays a single email. The campaign type now names the step; email_candidates() reports which steps a
-- player already received (sent_types) instead of one timestamp per campaign. Nothing had been sent when this ran.
--
-- Safe to rerun. Undo: put the three-type check back (onboarding_nudge, retention, reactivation) and recreate
-- email_candidates() from 0032.

alter table public.email_log drop constraint if exists email_log_campaign_type_check;
alter table public.email_log add constraint email_log_campaign_type_check
  check (campaign_type in ('onboarding_nudge', 'quick_win', 'feature_tour', 'feedback', 'reactivation'));

drop function if exists public.email_candidates();
create function public.email_candidates()
returns table (
  user_id text, email text, token text, lang text, name text, onboarded boolean, signup_at timestamptz,
  last_active_at timestamptz, completions_total int, habits int,
  last_email_at timestamptz, last_email_type text, emails_30d int, sent_types text[]
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
    (select count(*)::int from public.habits h where h.user_id = p.id and h.archived_at is null),
    (select max(l.sent_at) from public.email_log l where l.user_id = p.id and l.status <> 'failed'),
    (select l.campaign_type from public.email_log l where l.user_id = p.id and l.status <> 'failed' order by l.sent_at desc limit 1),
    (select count(*)::int from public.email_log l where l.user_id = p.id and l.status <> 'failed' and l.sent_at > now() - interval '30 days'),
    coalesce((select array_agg(distinct l.campaign_type) from public.email_log l where l.user_id = p.id and l.status <> 'failed'), '{}')
  from public.profiles p
  join public.email_preferences e on e.user_id = p.id
  where e.marketing_enabled and e.bounced_at is null and e.email is not null;
$$;

revoke execute on function public.email_candidates() from public, anon, authenticated;
grant execute on function public.email_candidates() to service_role;
