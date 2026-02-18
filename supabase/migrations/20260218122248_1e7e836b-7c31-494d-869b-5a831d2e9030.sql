
-- Asset documents table for compliance certificates, manuals, etc.
CREATE TABLE public.asset_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size integer,
  document_type text NOT NULL DEFAULT 'general',
  expiry_date date,
  uploaded_by uuid NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.asset_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all asset documents"
  ON public.asset_documents FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view asset documents"
  ON public.asset_documents FOR SELECT
  USING (has_role(auth.uid(), 'engineer'::app_role));

CREATE POLICY "Engineers can upload asset documents"
  ON public.asset_documents FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'engineer'::app_role) AND uploaded_by = auth.uid());

CREATE INDEX idx_asset_documents_asset_id ON public.asset_documents(asset_id);

-- Storage bucket for asset documents
INSERT INTO storage.buckets (id, name, public) VALUES ('asset-documents', 'asset-documents', false);

-- Storage RLS policies
CREATE POLICY "Authenticated users can upload asset documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'asset-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view asset documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'asset-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete asset documents"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'asset-documents' AND has_role(auth.uid(), 'admin'::app_role));
