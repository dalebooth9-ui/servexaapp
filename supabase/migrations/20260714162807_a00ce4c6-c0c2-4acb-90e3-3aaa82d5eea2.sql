
-- asset_review_flags: replace permissive policies with org-scoped
DROP POLICY IF EXISTS "auth read asset review flags" ON public.asset_review_flags;
DROP POLICY IF EXISTS "auth resolve asset review flags" ON public.asset_review_flags;

CREATE POLICY "Org members read asset review flags"
ON public.asset_review_flags
FOR SELECT
TO authenticated
USING (org_id = public.get_user_org_id());

CREATE POLICY "Org admins resolve asset review flags"
ON public.asset_review_flags
FOR UPDATE
TO authenticated
USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

-- asset_service_history: replace permissive read
DROP POLICY IF EXISTS "auth read asset history" ON public.asset_service_history;

CREATE POLICY "Org members read asset service history"
ON public.asset_service_history
FOR SELECT
TO authenticated
USING (org_id = public.get_user_org_id());

-- Storage: asset-documents bucket, add org-scoping via folder prefix
DROP POLICY IF EXISTS "Authenticated users can view asset documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload asset documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete asset documents" ON storage.objects;

CREATE POLICY "Org members view asset-documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'asset-documents'
  AND (storage.foldername(name))[1] = public.get_user_org_id()::text
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'engineer'::app_role)
  )
);

CREATE POLICY "Org members upload asset-documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'asset-documents'
  AND (storage.foldername(name))[1] = public.get_user_org_id()::text
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'engineer'::app_role)
  )
);

CREATE POLICY "Org admins delete asset-documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'asset-documents'
  AND (storage.foldername(name))[1] = public.get_user_org_id()::text
  AND public.has_role(auth.uid(), 'admin'::app_role)
);
