
CREATE TABLE public.conformity_certificates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  certificate_number TEXT NOT NULL DEFAULT '',
  issue_date TEXT NOT NULL DEFAULT '',
  job_name TEXT NOT NULL DEFAULT '',
  site_address TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  reference_number TEXT NOT NULL DEFAULT '',
  system_qty INTEGER NOT NULL DEFAULT 1,
  riser_locations TEXT NOT NULL DEFAULT '',
  installation_date TEXT NOT NULL DEFAULT '',
  test_outcome TEXT NOT NULL DEFAULT 'pass',
  test_notes TEXT NOT NULL DEFAULT '',
  engineer_name TEXT NOT NULL DEFAULT '',
  engineer_signature TEXT,
  sign_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
);

ALTER TABLE public.conformity_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all conformity certificates"
  ON public.conformity_certificates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view conformity certificates for assigned jobs"
  ON public.conformity_certificates FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM job_assignments ja
    WHERE ja.job_id = conformity_certificates.job_id AND ja.engineer_id = auth.uid()
  ));

CREATE TRIGGER update_conformity_certificates_updated_at
  BEFORE UPDATE ON public.conformity_certificates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
