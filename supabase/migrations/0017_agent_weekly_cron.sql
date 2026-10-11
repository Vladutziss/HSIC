-- Sunday 18:00 UTC (21:00 in Romania, 20:00 in winter): ask the `weekly` function to run the coach's
-- weekly plan for the players who opted in. The shared secret is the one in the function's
-- AGENT_CRON_SECRET; replace the placeholder below before running, and never commit the real value.
--
-- Before: deploy `weekly` (and the `push` update that accepts action "agent"), set AGENT_CRON_SECRET.
-- Undo: select cron.unschedule('agent-weekly');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'agent-weekly',
  '0 18 * * 0',
  $$ select net.http_post(
       url := 'https://ldggxdgrmlhcfoherdlu.supabase.co/functions/v1/weekly',
       headers := '{"Content-Type": "application/json", "x-cron-secret": "REPLACE_WITH_AGENT_CRON_SECRET"}'::jsonb,
       body := '{}'::jsonb
     ) $$
);
