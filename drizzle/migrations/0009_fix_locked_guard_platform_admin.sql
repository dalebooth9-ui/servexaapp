CREATE OR REPLACE FUNCTION public.guard_locked_job_sheet_response()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(),'admin')
     AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'This report has been submitted to the office and is locked';
  END IF;
  RETURN NEW;
END $$;