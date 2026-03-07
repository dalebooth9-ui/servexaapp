CREATE TABLE public.rams_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  rams_type text NOT NULL DEFAULT 'dry_riser',
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  contract_job_name text,
  assessment_date text,
  client text,
  attendance_date text,
  site_location text,
  operatives jsonb DEFAULT '[]'::jsonb,
  description_of_work text,
  sequence_of_ops jsonb DEFAULT '[]'::jsonb,
  task_specific_ops jsonb DEFAULT '[]'::jsonb,
  location text,
  resources text,
  personnel text,
  plant_and_equipment jsonb DEFAULT '[]'::jsonb,
  significant_risks jsonb DEFAULT '[]'::jsonb,
  special_training text,
  ppe_items jsonb DEFAULT '[]'::jsonb,
  risk_rows jsonb DEFAULT '[]'::jsonb
);

ALTER TABLE public.rams_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all RAMS documents"
  ON public.rams_documents
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view RAMS for assigned jobs"
  ON public.rams_documents
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.job_assignments ja
    WHERE ja.job_id = rams_documents.job_id AND ja.engineer_id = auth.uid()
  ));

CREATE TRIGGER update_rams_documents_updated_at
  BEFORE UPDATE ON public.rams_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();