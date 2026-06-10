
CREATE POLICY "Authenticated read blank-template-pdfs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'blank-template-pdfs');

CREATE POLICY "Authenticated write blank-template-pdfs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'blank-template-pdfs');

CREATE POLICY "Authenticated update blank-template-pdfs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'blank-template-pdfs')
WITH CHECK (bucket_id = 'blank-template-pdfs');
