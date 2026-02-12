
-- 1. Make submissions bucket private
UPDATE storage.buckets SET public = false WHERE id = 'submissions';

-- 2. Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Anyone can view submission files" ON storage.objects;

-- 3. Create a proper SELECT policy: admins + assigned engineers only
CREATE POLICY "Authenticated users can view assigned submission files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.submissions s
        JOIN public.job_assignments ja ON s.job_id = ja.job_id
        WHERE ja.engineer_id = auth.uid()
        AND s.file_url LIKE '%' || storage.objects.name || '%'
      )
    )
  );
