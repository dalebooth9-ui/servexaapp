CREATE TABLE public.job_site_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  access_notes text,
  hazards text,
  asset_locations text,
  parking_welfare text,
  recommendations text,
  notes text,
  sketch_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_site_surveys TO authenticated;
GRANT ALL ON public.job_site_surveys TO service_role;

ALTER TABLE public.job_site_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage site surveys in org"
  ON public.job_site_surveys
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_site_surveys.job_id
        AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_site_surveys.job_id
        AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)
    )
  );

CREATE POLICY "Engineers read site surveys for assigned jobs"
  ON public.job_site_surveys
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_assignments ja
      WHERE ja.job_id = job_site_surveys.job_id
        AND ja.engineer_id = auth.uid()
    )
  );

CREATE POLICY "Engineers insert site surveys for assigned jobs"
  ON public.job_site_surveys
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.job_assignments ja
      WHERE ja.job_id = job_site_surveys.job_id
        AND ja.engineer_id = auth.uid()
    )
  );

CREATE POLICY "Engineers update site surveys for assigned jobs"
  ON public.job_site_surveys
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_assignments ja
      WHERE ja.job_id = job_site_surveys.job_id
        AND ja.engineer_id = auth.uid()
    )
  );

CREATE TRIGGER update_job_site_surveys_updated_at
BEFORE UPDATE ON public.job_site_surveys
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();