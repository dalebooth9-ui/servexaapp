
-- Compliance records: certificates, inspections, etc.
CREATE TABLE public.compliance_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  record_type text NOT NULL DEFAULT 'certificate',
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  issuer text,
  reference_number text,
  issue_date date,
  expiry_date date,
  status text NOT NULL DEFAULT 'valid',
  file_url text,
  file_name text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_compliance_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('valid', 'expiring_soon', 'expired', 'not_applicable') THEN
    RAISE EXCEPTION 'Invalid compliance status: %', NEW.status;
  END IF;
  IF NEW.record_type NOT IN ('certificate', 'inspection', 'gas_safety', 'legionella', 'fire_risk', 'pat_testing', 'asbestos', 'electrical', 'insurance', 'other') THEN
    RAISE EXCEPTION 'Invalid record type: %', NEW.record_type;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_compliance_status
  BEFORE INSERT OR UPDATE ON public.compliance_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_compliance_status();

CREATE TRIGGER update_compliance_records_updated_at
  BEFORE UPDATE ON public.compliance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.compliance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all compliance records"
  ON public.compliance_records FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view compliance records"
  ON public.compliance_records FOR SELECT
  USING (has_role(auth.uid(), 'engineer'::app_role));

CREATE INDEX idx_compliance_records_asset ON public.compliance_records(asset_id);
CREATE INDEX idx_compliance_records_site ON public.compliance_records(site_id);
CREATE INDEX idx_compliance_records_expiry ON public.compliance_records(expiry_date);
CREATE INDEX idx_compliance_records_status ON public.compliance_records(status);

-- Audit templates
CREATE TABLE public.audit_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TRIGGER update_audit_templates_updated_at
  BEFORE UPDATE ON public.audit_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.audit_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all audit templates"
  ON public.audit_templates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view audit templates"
  ON public.audit_templates FOR SELECT
  USING (has_role(auth.uid(), 'engineer'::app_role));

-- Audit template items (checklist items)
CREATE TABLE public.audit_template_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES public.audit_templates(id) ON DELETE CASCADE,
  question text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT true,
  item_type text NOT NULL DEFAULT 'pass_fail'
);

ALTER TABLE public.audit_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all template items"
  ON public.audit_template_items FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view template items"
  ON public.audit_template_items FOR SELECT
  USING (has_role(auth.uid(), 'engineer'::app_role));

CREATE INDEX idx_audit_template_items_template ON public.audit_template_items(template_id);

-- Completed audits
CREATE TABLE public.audits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES public.audit_templates(id) ON DELETE RESTRICT,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  auditor_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  score_percent numeric,
  notes text,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_audit_status_check()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('in_progress', 'completed', 'failed') THEN
    RAISE EXCEPTION 'Invalid audit status: %', NEW.status;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_audit_status
  BEFORE INSERT OR UPDATE ON public.audits
  FOR EACH ROW EXECUTE FUNCTION public.validate_audit_status_check();

CREATE TRIGGER update_audits_updated_at
  BEFORE UPDATE ON public.audits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all audits"
  ON public.audits FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view audits"
  ON public.audits FOR SELECT
  USING (has_role(auth.uid(), 'engineer'::app_role));

CREATE POLICY "Engineers can create audits"
  ON public.audits FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'engineer'::app_role) AND auditor_id = auth.uid());

CREATE POLICY "Engineers can update own audits"
  ON public.audits FOR UPDATE
  USING (auditor_id = auth.uid() AND has_role(auth.uid(), 'engineer'::app_role));

CREATE INDEX idx_audits_template ON public.audits(template_id);
CREATE INDEX idx_audits_site ON public.audits(site_id);

-- Audit responses (answers to checklist items)
CREATE TABLE public.audit_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.audit_template_items(id) ON DELETE CASCADE,
  result text NOT NULL DEFAULT 'pending',
  notes text,
  photo_url text
);

ALTER TABLE public.audit_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all audit responses"
  ON public.audit_responses FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view audit responses"
  ON public.audit_responses FOR SELECT
  USING (has_role(auth.uid(), 'engineer'::app_role));

CREATE POLICY "Engineers can insert audit responses"
  ON public.audit_responses FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'engineer'::app_role));

CREATE POLICY "Engineers can update audit responses"
  ON public.audit_responses FOR UPDATE
  USING (has_role(auth.uid(), 'engineer'::app_role));

CREATE INDEX idx_audit_responses_audit ON public.audit_responses(audit_id);

-- Storage for compliance documents
CREATE POLICY "Authenticated users can upload compliance docs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'asset-documents' AND auth.uid() IS NOT NULL);
