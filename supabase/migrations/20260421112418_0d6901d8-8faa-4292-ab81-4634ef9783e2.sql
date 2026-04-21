ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE OR REPLACE FUNCTION public.validate_job_priority()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.priority NOT IN ('high', 'medium', 'low') THEN
    RAISE EXCEPTION 'Invalid priority: %. Must be high, medium, or low.', NEW.priority;
  END IF;
  IF NEW.status NOT IN ('active', 'completed', 'archived', 'awaiting_parts', 'on_hold', 'requires_revisit', 'scheduled', 'in_progress', 'pending_review', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status: %.', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$;