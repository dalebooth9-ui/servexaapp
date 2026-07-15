-- Fix signatures storage bucket RLS: accept both legacy uid-first paths
-- and the new org-prefixed paths that buildOrgPathAsync produces
-- (`<org_id>/<uid>/...` for engineer files, `<org_id>/customer/...` for
-- customer sign-off). Without this update, engineers hit
-- "new row violates row-level security policy" when saving a signature
-- on mobile because the org prefix breaks foldername[1] = auth.uid().

DROP POLICY IF EXISTS "Engineers can upload own signatures" ON storage.objects;
CREATE POLICY "Engineers can upload own signatures"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'signatures'
  AND public.has_role(auth.uid(), 'engineer'::app_role)
  AND (
    -- legacy path: <uid>/...
    (storage.foldername(name))[1] = auth.uid()::text
    -- org-prefixed engineer path: <org_id>/<uid>/...
    OR (
      (storage.foldername(name))[2] = auth.uid()::text
      AND public.user_can_access_storage_path(name)
    )
  )
);

DROP POLICY IF EXISTS "Engineers can view signatures for assigned jobs" ON storage.objects;
CREATE POLICY "Engineers can view signatures for assigned jobs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'signatures'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'engineer'::app_role)
      AND (
        -- own uploads (legacy or org-prefixed)
        (storage.foldername(name))[1] = auth.uid()::text
        OR (storage.foldername(name))[2] = auth.uid()::text
        -- signatures for jobs the engineer is assigned to (any teammate or
        -- customer sign-off); scope to the engineer's org via the path prefix.
        OR (
          public.user_can_access_storage_path(name)
          AND EXISTS (
            SELECT 1 FROM public.job_assignments ja
            WHERE ja.engineer_id = auth.uid()
          )
        )
      )
    )
  )
);
