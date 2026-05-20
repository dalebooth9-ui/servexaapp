DO $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobid, jobname
    FROM cron.job
    WHERE jobname IN (
      'send-visit-reminders-daily',
      'check-followup-reminders-daily',
      'process-email-queue'
    )
  LOOP
    PERFORM cron.alter_job(v_job.jobid, active => false);
  END LOOP;
END $$;