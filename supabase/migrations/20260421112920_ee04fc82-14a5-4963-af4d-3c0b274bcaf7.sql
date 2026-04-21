CREATE OR REPLACE FUNCTION public.log_job_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.job_activity_log (job_id, user_id, action, details)
    VALUES (
      NEW.id,
      auth.uid(),
      'status_change',
      'Status changed from ' || OLD.status || ' to ' || NEW.status
        || CASE WHEN NEW.status = 'rejected' AND NEW.rejection_reason IS NOT NULL
                THEN ' — Reason: ' || NEW.rejection_reason
                ELSE '' END
    );
  END IF;
  RETURN NEW;
END;
$function$;