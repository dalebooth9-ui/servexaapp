CREATE OR REPLACE FUNCTION public.count_seed_test_jobs()
RETURNS TABLE(seed_jobs bigint, seed_visits bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (SELECT count(*) FROM public.jobs
       WHERE id::text LIKE 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa%') AS seed_jobs,
    (SELECT count(*) FROM public.job_visits v
       WHERE v.job_id::text LIKE 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa%'
         AND v.status IN ('upcoming','unscheduled','overdue')
         AND v.scheduled_date >= CURRENT_DATE) AS seed_visits;
$$;

CREATE OR REPLACE FUNCTION public.set_email_automation_active(_jobname text, _active boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $function$
DECLARE
  v_jobid bigint;
  v_seed_jobs bigint;
  v_seed_visits bigint;
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

  -- Safety: block re-enabling visit reminders while seed/test data is still present
  IF _active = true AND _jobname = 'send-visit-reminders-daily' THEN
    SELECT seed_jobs, seed_visits INTO v_seed_jobs, v_seed_visits
    FROM public.count_seed_test_jobs();
    IF COALESCE(v_seed_jobs, 0) > 0 OR COALESCE(v_seed_visits, 0) > 0 THEN
      RAISE EXCEPTION 'Cannot enable visit reminders: % seed/test job(s) and % upcoming seed visit(s) still exist. Delete the seed data first to prevent unwanted emails being sent to real customers.', v_seed_jobs, v_seed_visits
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = _jobname LIMIT 1;
  IF v_jobid IS NULL THEN
    RAISE EXCEPTION 'Cron job % not found', _jobname;
  END IF;

  PERFORM cron.alter_job(job_id := v_jobid, active := _active);
  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.count_seed_test_jobs() TO authenticated;