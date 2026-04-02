
-- Fix submissions bucket: restrict uploads to admin/engineer roles
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
CREATE POLICY "Admins and engineers can upload submissions"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'submissions'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'engineer'::app_role))
  );

-- Fix signatures bucket: scope engineer read access to assigned jobs
DROP POLICY IF EXISTS "Engineers can view signatures for assigned jobs" ON storage.objects;
CREATE POLICY "Engineers can view signatures for assigned jobs"
  ON storage.objects
  FOR SELECT
  TO public
  USING (
    bucket_id = 'signatures'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (
        has_role(auth.uid(), 'engineer'::app_role)
        AND (
          (auth.uid())::text = (storage.foldername(name))[1]
          OR EXISTS (
            SELECT 1 FROM job_assignments ja
            WHERE ja.engineer_id = auth.uid()
              AND ja.job_id::text = (storage.foldername(name))[1]
          )
        )
      )
    )
  );
