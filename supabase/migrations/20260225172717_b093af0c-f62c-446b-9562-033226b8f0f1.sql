
INSERT INTO storage.buckets (id, name, public) VALUES ('engineer-documents', 'engineer-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins can manage engineer document files"
  ON storage.objects FOR ALL
  USING (bucket_id = 'engineer-documents' AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'engineer-documents' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view own document files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'engineer-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
