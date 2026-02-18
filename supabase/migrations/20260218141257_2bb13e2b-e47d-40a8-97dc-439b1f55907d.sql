
-- Create storage bucket for signatures
INSERT INTO storage.buckets (id, name, public) VALUES ('signatures', 'signatures', false);

-- Storage policies for signatures bucket
CREATE POLICY "Admins can manage all signatures"
ON storage.objects FOR ALL
USING (bucket_id = 'signatures' AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'signatures' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can upload own signatures"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'signatures' AND has_role(auth.uid(), 'engineer'::app_role) AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Engineers can view signatures for assigned jobs"
ON storage.objects FOR SELECT
USING (bucket_id = 'signatures' AND (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'engineer'::app_role)
));

-- Create job_signatures table
CREATE TABLE public.job_signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  signer_id UUID NOT NULL,
  signer_name TEXT NOT NULL DEFAULT '',
  signer_role TEXT NOT NULL DEFAULT 'engineer',
  file_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.job_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all signatures"
ON public.job_signatures FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can add signatures to assigned jobs"
ON public.job_signatures FOR INSERT
WITH CHECK (
  signer_id = auth.uid() AND
  EXISTS (SELECT 1 FROM job_assignments ja WHERE ja.job_id = job_signatures.job_id AND ja.engineer_id = auth.uid())
);

CREATE POLICY "Engineers can view signatures for assigned jobs"
ON public.job_signatures FOR SELECT
USING (
  EXISTS (SELECT 1 FROM job_assignments ja WHERE ja.job_id = job_signatures.job_id AND ja.engineer_id = auth.uid())
);

CREATE POLICY "Engineers can delete own signatures"
ON public.job_signatures FOR DELETE
USING (signer_id = auth.uid());
