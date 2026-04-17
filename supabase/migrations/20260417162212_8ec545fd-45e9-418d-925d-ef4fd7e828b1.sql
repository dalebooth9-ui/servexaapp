-- Add new columns to defects (idempotent)
ALTER TABLE public.defects
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS location_on_site text,
  ADD COLUMN IF NOT EXISTS bs_standard_reference text,
  ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

-- Update status validation to allow 'quoted'
CREATE OR REPLACE FUNCTION public.validate_defect_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.severity NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Invalid defect severity: %', NEW.severity;
  END IF;
  IF NEW.status NOT IN ('open', 'in_progress', 'resolved', 'deferred', 'quoted') THEN
    RAISE EXCEPTION 'Invalid defect status: %', NEW.status;
  END IF;
  IF NEW.category IS NOT NULL AND NEW.category NOT IN ('fire_alarm','emergency_lighting','extinguisher','sprinkler','dry_riser','suppression','passive_fire','other') THEN
    RAISE EXCEPTION 'Invalid defect category: %', NEW.category;
  END IF;
  RETURN NEW;
END;
$function$;