-- Every day 17:00 UTC (20:00 in Romania, 19:00 in winter): ask the `weekly` function for the streak check, for the
-- players with settings.agentNudge. Same shared secret as 0017 (AGENT_CRON_SECRET); replace the placeholder before
-- running and never commit the real value.
--
-- Before: deploy `weekly` and `push` (both changed). Undo: select cron.unschedule('agent-nudge');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'agent-nudge',
  '0 17 * * *',
  $$ select net.http_post(
       url := 'https://ldggxdgrmlhcfoherdlu.supabase.co/functions/v1/weekly',
       headers := '{"Content-Type": "application/json", "x-cron-secret": "REPLACE_WITH_AGENT_CRON_SECRET"}'::jsonb,
       body := '{"mode": "streak"}'::jsonb
     ) $$
);
