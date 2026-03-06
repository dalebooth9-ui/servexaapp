-- Create customer_paperwork table for storing customer-specific job sheet templates
CREATE TABLE public.customer_paperwork (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  auto_attach BOOLEAN NOT NULL DEFAULT true,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_paperwork ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all customer paperwork"
  ON public.customer_paperwork FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view customer paperwork"
  ON public.customer_paperwork FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs j
      JOIN job_assignments ja ON ja.job_id = j.id
      WHERE j.customer_id = customer_paperwork.customer_id
        AND ja.engineer_id = auth.uid()
    )
  );

CREATE TRIGGER update_customer_paperwork_updated_at
  BEFORE UPDATE ON public.customer_paperwork
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-paperwork', 'customer-paperwork', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins can manage customer paperwork files"
  ON storage.objects FOR ALL
  USING (bucket_id = 'customer-paperwork' AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'customer-paperwork' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can read customer paperwork files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'customer-paperwork' AND has_role(auth.uid(), 'engineer'::app_role));