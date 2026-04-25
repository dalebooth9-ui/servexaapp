-- Add publish/draft status to job_sheet_templates
ALTER TABLE public.job_sheet_templates
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';

-- Validation trigger (CHECK constraints discouraged; use trigger for consistency with existing patterns)
CREATE OR REPLACE FUNCTION public.validate_job_sheet_template_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'Invalid template status: %. Must be draft or published.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_job_sheet_template_status_trigger ON public.job_sheet_templates;
CREATE TRIGGER validate_job_sheet_template_status_trigger
  BEFORE INSERT OR UPDATE ON public.job_sheet_templates
  FOR EACH ROW EXECUTE FUNCTION public.validate_job_sheet_template_status();

-- Backfill: any existing row stays published (already the default for non-null column)
UPDATE public.job_sheet_templates SET status = 'published' WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_job_sheet_templates_status ON public.job_sheet_templates(status);