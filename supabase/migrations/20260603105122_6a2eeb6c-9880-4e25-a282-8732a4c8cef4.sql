-- Standalone site surveys (not tied to jobs)
CREATE SEQUENCE IF NOT EXISTS public.site_survey_seq START 1;

CREATE TABLE public.site_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text UNIQUE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  survey_date date,
  site_address text,
  contact_name text,
  contact_phone text,
  access_notes text,
  hazards text,
  asset_locations text,
  parking_welfare text,
  recommendations text,
  notes text,
  engineer_id uuid,
  signature_url text,
  created_by uuid,
  org_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_surveys TO authenticated;
GRANT ALL ON public.site_surveys TO service_role;

ALTER TABLE public.site_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all site surveys" ON public.site_surveys
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Engineers view assigned or own site surveys" ON public.site_surveys
  FOR SELECT TO authenticated
  USING (engineer_id = auth.uid() OR created_by = auth.uid());

CREATE POLICY "Engineers insert own site surveys" ON public.site_surveys
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Engineers update own/assigned site surveys" ON public.site_surveys
  FOR UPDATE TO authenticated
  USING (engineer_id = auth.uid() OR created_by = auth.uid())
  WITH CHECK (engineer_id = auth.uid() OR created_by = auth.uid());

CREATE TRIGGER site_surveys_updated_at
  BEFORE UPDATE ON public.site_surveys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.assign_site_survey_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reference_number IS NULL OR NEW.reference_number = '' THEN
    NEW.reference_number := 'SS-' || LPAD(nextval('site_survey_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER site_surveys_set_reference
  BEFORE INSERT ON public.site_surveys
  FOR EACH ROW EXECUTE FUNCTION public.assign_site_survey_reference();

CREATE INDEX idx_site_surveys_customer ON public.site_surveys(customer_id);
CREATE INDEX idx_site_surveys_site ON public.site_surveys(site_id);
CREATE INDEX idx_site_surveys_engineer ON public.site_surveys(engineer_id);
CREATE INDEX idx_site_surveys_status ON public.site_surveys(status);