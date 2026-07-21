
DROP POLICY IF EXISTS "Engineers can view signatures for assigned jobs" ON storage.objects;

CREATE POLICY "Engineers can view signatures for assigned jobs"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'signatures'
  AND (
    -- Admins in the file's org
    has_role_in_org(auth.uid(), storage_object_org_id(name), 'admin'::app_role)
    OR (
      has_role_in_org(auth.uid(), storage_object_org_id(name), 'engineer'::app_role)
      AND (
        -- Engineer's own uploads (path convention: {org}/{userId}/... or {userId}/...)
        (storage.foldername(name))[1] = (auth.uid())::text
        OR (storage.foldername(name))[2] = (auth.uid())::text
        -- Or a signature row exists for this exact file, and the engineer
        -- is assigned to that specific job.
        OR EXISTS (
          SELECT 1
          FROM public.job_signatures js
          JOIN public.job_assignments ja
            ON ja.job_id = js.job_id
          WHERE js.file_path = storage.objects.name
            AND ja.engineer_id = auth.uid()
        )
      )
    )
  )
);
