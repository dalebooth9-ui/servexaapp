
-- Schedule sync-bank-holidays to run on 1st January at 06:00 UTC each year
SELECT cron.schedule(
  'sync-uk-bank-holidays-annually',
  '0 6 1 1 *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/sync-bank-holidays',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  )
  $$
);
