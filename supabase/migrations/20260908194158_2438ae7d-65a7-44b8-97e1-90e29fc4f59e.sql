CREATE POLICY "Allow authenticated uploads to marketing screenshots"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'marketing-screenshots');

CREATE POLICY "Allow authenticated reads with signed URLs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'marketing-screenshots');