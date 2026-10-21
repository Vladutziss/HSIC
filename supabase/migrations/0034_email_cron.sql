-- Every day 15:30 UTC (17:30 in Romania in summer, 18:30 in winter, after school hours): ask the `campaigns` function to
-- run the email job. NOT APPLIED on purpose: until CAMPAIGNS_ENABLED=true is set as a Supabase secret the function only
-- reports what it would send (dry run), so scheduling it earlier changes nothing but gives you a daily report in the logs.
-- Replace the placeholder with the CAMPAIGNS_SECRET value before running, and never commit the real value.
-- Details: docs/EMAILS.md.
--
-- Undo: select cron.unschedule('email-campaigns');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'email-campaigns',
  '30 15 * * *',
  $$ select net.http_post(
       url := 'https://ldggxdgrmlhcfoherdlu.supabase.co/functions/v1/campaigns',
       headers := '{"Content-Type": "application/json", "x-cron-secret": "REPLACE_WITH_CAMPAIGNS_SECRET"}'::jsonb,
       body := '{}'::jsonb
     ) $$
);
