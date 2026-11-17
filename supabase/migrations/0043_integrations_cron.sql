-- Every minute: ask the `webhooks` function to deliver what is waiting in the outbox (webhooks and Notion pages).
-- Replace the placeholder with the INTEGRATIONS_CRON_SECRET value before running, and never commit the real value.
-- Before: migration 0042, `supabase functions deploy webhooks --no-verify-jwt`, the secret set. Details: docs/INTEGRATIONS.md.
--
-- Undo: select cron.unschedule('integrations-outbox');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'integrations-outbox',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://ldggxdgrmlhcfoherdlu.supabase.co/functions/v1/webhooks',
       headers := '{"Content-Type": "application/json", "x-cron-secret": "REPLACE_WITH_INTEGRATIONS_CRON_SECRET"}'::jsonb,
       body := '{"action": "run"}'::jsonb
     ) where exists (select 1 from public.integration_events where status = 'pending' and next_attempt_at <= now()) $$
);
