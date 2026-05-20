
-- Admin-only RPCs to manage email automation cron jobs
CREATE OR REPLACE FUNCTION public.get_email_automation_status()
RETURNS TABLE(jobname text, active boolean, schedule text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  RETURN QUERY
  SELECT j.jobname::text, j.active, j.schedule::text
  FROM cron.job j
  WHERE j.jobname IN (
    'send-visit-reminders-daily',
    'check-followup-reminders-daily',
    'process-email-queue',
    'send-weekly-management-report',
    'check-compliance-expiry-daily',
    'check-engineer-doc-expiry-daily'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_email_automation_active(_jobname text, _active boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_jobid bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  IF _jobname NOT IN (
    'send-visit-reminders-daily',
    'check-followup-reminders-daily',
    'process-email-queue',
    'send-weekly-management-report',
    'check-compliance-expiry-daily',
    'check-engineer-doc-expiry-daily'
  ) THEN
    RAISE EXCEPTION 'Job not allowed: %', _jobname;
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = _jobname LIMIT 1;
  IF v_jobid IS NULL THEN
    RAISE EXCEPTION 'Cron job % not found', _jobname;
  END IF;

  PERFORM cron.alter_job(job_id := v_jobid, active := _active);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_email_automation_status() FROM public, anon;
REVOKE ALL ON FUNCTION public.set_email_automation_active(text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_email_automation_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_email_automation_active(text, boolean) TO authenticated;
