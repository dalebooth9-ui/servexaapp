CREATE OR REPLACE FUNCTION public.log_new_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.type = 'photo' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.job_activity_log (job_id, user_id, action, details)
  VALUES (NEW.job_id, NEW.engineer_id, 'submission', NEW.type || COALESCE(': ' || NEW.file_name, ''));
  RETURN NEW;
END;
$$;

DELETE FROM public.job_activity_log
WHERE action = 'submission'
  AND details ~* '^photo(:|$)';