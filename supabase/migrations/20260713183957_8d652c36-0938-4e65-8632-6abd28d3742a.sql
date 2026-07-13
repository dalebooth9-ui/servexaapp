-- Purge rejected email-PO jobs older than 60 days, with their attachments.
CREATE OR REPLACE FUNCTION public.purge_old_rejected_email_po_jobs()
RETURNS TABLE(deleted_jobs int, deleted_objects int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_cutoff timestamptz := now() - interval '60 days';
  v_jobs int := 0;
  v_objs int := 0;
BEGIN
  -- Delete storage objects for those jobs (po-intake bucket paths are "<org_id>/<job_id>/...").
  WITH targets AS (
    SELECT id, org_id FROM public.jobs
    WHERE status = 'rejected'
      AND source = 'email_po'
      AND created_at < v_cutoff
  ),
  del_objs AS (
    DELETE FROM storage.objects o
    USING targets t
    WHERE o.bucket_id = 'po-intake'
      AND o.name LIKE (t.org_id::text || '/' || t.id::text || '/%')
    RETURNING 1
  )
  SELECT count(*) INTO v_objs FROM del_objs;

  -- Delete job_documents rows for those jobs (no FK cascade guaranteed).
  DELETE FROM public.job_documents jd
   USING public.jobs j
   WHERE jd.job_id = j.id
     AND j.status = 'rejected'
     AND j.source = 'email_po'
     AND j.created_at < v_cutoff;

  -- Finally delete the jobs themselves.
  WITH del AS (
    DELETE FROM public.jobs
    WHERE status = 'rejected'
      AND source = 'email_po'
      AND created_at < v_cutoff
    RETURNING 1
  )
  SELECT count(*) INTO v_jobs FROM del;

  RETURN QUERY SELECT v_jobs, v_objs;
END;
$$;

-- Schedule daily at 03:15 UTC.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-rejected-email-po-jobs') THEN
    PERFORM cron.unschedule('purge-rejected-email-po-jobs');
  END IF;
  PERFORM cron.schedule(
    'purge-rejected-email-po-jobs',
    '15 3 * * *',
    $cron$ SELECT public.purge_old_rejected_email_po_jobs(); $cron$
  );
END $$;