
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS is_remedial BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_jobs_is_remedial ON public.jobs(is_remedial) WHERE is_remedial = true;

CREATE TABLE IF NOT EXISTS public.job_remedial_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  org_id UUID,
  seq INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  comment TEXT,
  photo_submission_id UUID,
  done_by UUID,
  done_at TIMESTAMP WITH TIME ZONE,
  source TEXT NOT NULL DEFAULT 'manual',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_remedial_items_job ON public.job_remedial_items(job_id);
CREATE INDEX IF NOT EXISTS idx_job_remedial_items_org ON public.job_remedial_items(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_remedial_items TO authenticated;
GRANT ALL ON public.job_remedial_items TO service_role;

ALTER TABLE public.job_remedial_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all remedial items"
  ON public.job_remedial_items FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Engineers manage remedial items on assigned jobs"
  ON public.job_remedial_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.job_assignments ja
    WHERE ja.job_id = job_remedial_items.job_id AND ja.engineer_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.job_assignments ja
    WHERE ja.job_id = job_remedial_items.job_id AND ja.engineer_id = auth.uid()
  ));

CREATE POLICY "Service role manages remedial items"
  ON public.job_remedial_items FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_job_remedial_items_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_job_remedial_items_updated_at ON public.job_remedial_items;
CREATE TRIGGER trg_job_remedial_items_updated_at
  BEFORE UPDATE ON public.job_remedial_items
  FOR EACH ROW EXECUTE FUNCTION public.set_job_remedial_items_updated_at();

INSERT INTO public.job_sheet_templates (name, description, category, job_category, status, fields, org_id)
SELECT
  'Remedial Works Completion',
  'Generic remedial works completion sheet — auto-attached to remedial jobs with no other sheet. Works items table with done/N-A, materials used, overall comments, signatures.',
  'general',
  'general',
  'published',
  jsonb_build_object(
    'kind', 'remedial_completion',
    'sections', jsonb_build_array(
      jsonb_build_object('type', 'header_fields'),
      jsonb_build_object('type', 'remedial_items_table'),
      jsonb_build_object('type', 'materials_used'),
      jsonb_build_object('type', 'overall_comments'),
      jsonb_build_object('type', 'signatures')
    )
  ),
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.job_sheet_templates
  WHERE lower(name) = 'remedial works completion' AND status = 'published'
);
