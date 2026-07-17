
CREATE TABLE public.historic_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.job_sheet_templates(id) ON DELETE SET NULL,
  report_date date,
  report_type text,
  report_type_label text,
  original_filename text NOT NULL,
  storage_path text NOT NULL,
  file_size bigint,
  mime_type text,
  extracted_customer text,
  extracted_site text,
  extracted_notes text,
  match_confidence text,
  imported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.historic_reports TO authenticated;
GRANT ALL ON public.historic_reports TO service_role;

ALTER TABLE public.historic_reports ENABLE ROW LEVEL SECURITY;

-- Auto-fill org_id from the caller's profile on INSERT so client can't spoof it.
CREATE OR REPLACE FUNCTION public.historic_reports_set_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL OR NEW.org_id <> get_user_org_id() THEN
    NEW.org_id := get_user_org_id();
  END IF;
  IF NEW.imported_by IS NULL THEN
    NEW.imported_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_historic_reports_set_org
  BEFORE INSERT ON public.historic_reports
  FOR EACH ROW EXECUTE FUNCTION public.historic_reports_set_org();

CREATE TRIGGER trg_historic_reports_updated
  BEFORE UPDATE ON public.historic_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Read/write within the org
CREATE POLICY "Org members read historic_reports"
  ON public.historic_reports
  FOR SELECT
  TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY "Org members insert historic_reports"
  ON public.historic_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "Org members update historic_reports"
  ON public.historic_reports
  FOR UPDATE
  TO authenticated
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "Org admins delete historic_reports"
  ON public.historic_reports
  FOR DELETE
  TO authenticated
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

-- Suspension gate mirrors other operational tables
CREATE POLICY "deny_when_org_suspended"
  ON public.historic_reports
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (is_org_active(get_user_org_id()))
  WITH CHECK (is_org_active(get_user_org_id()));

CREATE INDEX idx_historic_reports_org_site_date
  ON public.historic_reports (org_id, site_id, report_date DESC NULLS LAST);
CREATE INDEX idx_historic_reports_org_type
  ON public.historic_reports (org_id, report_type);
CREATE INDEX idx_historic_reports_org_customer
  ON public.historic_reports (org_id, customer_id);
