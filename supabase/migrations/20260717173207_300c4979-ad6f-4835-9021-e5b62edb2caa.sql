
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS detected_work_types text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS template_mismatch_reason text,
  ADD COLUMN IF NOT EXISTS mismatch_approved_reason text,
  ADD COLUMN IF NOT EXISTS mismatch_approved_by uuid,
  ADD COLUMN IF NOT EXISTS mismatch_approved_at timestamptz;

-- Auto-clear mismatch reason when a blank job sheet is attached
CREATE OR REPLACE FUNCTION public.clear_template_mismatch_on_attach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.document_type IN ('blank_job_sheet','job_sheet_template','template') AND NEW.job_id IS NOT NULL THEN
    UPDATE public.jobs
       SET template_mismatch_reason = NULL
     WHERE id = NEW.job_id
       AND template_mismatch_reason IS NOT NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_clear_template_mismatch_on_attach ON public.job_documents;
CREATE TRIGGER trg_clear_template_mismatch_on_attach
AFTER INSERT ON public.job_documents
FOR EACH ROW
EXECUTE FUNCTION public.clear_template_mismatch_on_attach();
