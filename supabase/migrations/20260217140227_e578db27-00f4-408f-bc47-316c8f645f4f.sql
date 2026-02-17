
-- Add priority and category columns to jobs table
ALTER TABLE public.jobs 
ADD COLUMN priority text NOT NULL DEFAULT 'medium',
ADD COLUMN category text NOT NULL DEFAULT 'general';

-- Add check-like validation via trigger for priority
CREATE OR REPLACE FUNCTION public.validate_job_priority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.priority NOT IN ('high', 'medium', 'low') THEN
    RAISE EXCEPTION 'Invalid priority: %. Must be high, medium, or low.', NEW.priority;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_job_priority_trigger
BEFORE INSERT OR UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.validate_job_priority();
