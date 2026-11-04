ALTER TABLE public.job_categories ADD COLUMN IF NOT EXISTS print_template_id uuid REFERENCES public.job_sheet_templates(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.job_categories.print_template_id IS 'Default engineer paper sheet printed by Print reports for jobs of this type (company-owned or shared template).';
CREATE OR REPLACE FUNCTION public.guard_job_category_print_template()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.print_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.job_sheet_templates t
    WHERE t.id = NEW.print_template_id AND (t.org_id IS NULL OR t.org_id = NEW.org_id)
  ) THEN
    RAISE EXCEPTION 'Print template must belong to the same company';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_job_category_print_template ON public.job_categories;
CREATE TRIGGER trg_guard_job_category_print_template BEFORE INSERT OR UPDATE OF print_template_id, org_id ON public.job_categories
FOR EACH ROW EXECUTE FUNCTION public.guard_job_category_print_template();