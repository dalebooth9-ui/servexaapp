-- Drop overly-broad installation-photos storage policies
DROP POLICY IF EXISTS "Auth users can upload installation photos" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can view installation photos" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete installation photos" ON storage.objects;

-- SELECT: admins OR the engineer whose user_id matches folder[2] of path {job_id}/{user_id}/filename
CREATE POLICY "Scoped view installation photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'installation-photos' AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR auth.uid()::text = (storage.foldername(name))[2]
    )
  );

-- INSERT: admins OR engineer uploading into their own subfolder
CREATE POLICY "Scoped upload installation photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'installation-photos' AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR auth.uid()::text = (storage.foldername(name))[2]
    )
  );

-- UPDATE: admins OR the owning engineer
CREATE POLICY "Scoped update installation photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'installation-photos' AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR auth.uid()::text = (storage.foldername(name))[2]
    )
  );

-- DELETE: admins OR the owning engineer
CREATE POLICY "Scoped delete installation photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'installation-photos' AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR auth.uid()::text = (storage.foldername(name))[2]
    )
  );