
CREATE TABLE public.engineer_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engineer_id uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size integer,
  document_type text NOT NULL DEFAULT 'certificate',
  title text NOT NULL DEFAULT '',
  expiry_date date,
  notes text,
  uploaded_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.engineer_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all engineer documents"
  ON public.engineer_documents FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view own documents"
  ON public.engineer_documents FOR SELECT
  USING (engineer_id = auth.uid());

CREATE TRIGGER update_engineer_documents_updated_at
  BEFORE UPDATE ON public.engineer_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
