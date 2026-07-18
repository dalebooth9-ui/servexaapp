
-- 1. engineer_documents: add org scope to "Engineers can view own documents"
DROP POLICY IF EXISTS "Engineers can view own documents" ON public.engineer_documents;
CREATE POLICY "Engineers can view own documents"
ON public.engineer_documents
FOR SELECT
USING (engineer_id = auth.uid() AND org_id = public.get_user_org_id());

-- 2. engineer_signatures: standardise org derivation via helper
DROP POLICY IF EXISTS "Org members read engineer_signatures" ON public.engineer_signatures;
CREATE POLICY "Org members read engineer_signatures"
ON public.engineer_signatures
FOR SELECT
USING (org_id = public.get_user_org_id());

-- 3. site-survey-media storage policies: use storage_object_org_id()
DROP POLICY IF EXISTS "Admins or owner read site-survey-media" ON storage.objects;
CREATE POLICY "Admins or owner read site-survey-media"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'site-survey-media'
  AND (
    owner = auth.uid()
    OR (
      public.storage_object_org_id(name) = public.get_user_org_id()
      AND public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin'::public.app_role)
    )
  )
);

DROP POLICY IF EXISTS "Admins or owner update site-survey-media" ON storage.objects;
CREATE POLICY "Admins or owner update site-survey-media"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'site-survey-media'
  AND (
    owner = auth.uid()
    OR (
      public.storage_object_org_id(name) = public.get_user_org_id()
      AND public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin'::public.app_role)
    )
  )
);

DROP POLICY IF EXISTS "Admins or owner delete site-survey-media" ON storage.objects;
CREATE POLICY "Admins or owner delete site-survey-media"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'site-survey-media'
  AND (
    owner = auth.uid()
    OR (
      public.storage_object_org_id(name) = public.get_user_org_id()
      AND public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin'::public.app_role)
    )
  )
);

-- Also tighten upload path to require org-prefixed path so new uploads match the read policy
DROP POLICY IF EXISTS "Authenticated upload own site-survey-media" ON storage.objects;
CREATE POLICY "Authenticated upload own site-survey-media"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'site-survey-media'
  AND owner = auth.uid()
  AND public.storage_object_org_id(name) = public.get_user_org_id()
);

-- 4. vehicle-checks photo SELECT policy: remove nested self-join
DROP POLICY IF EXISTS "Vehicle check photos: owner or same-org admin" ON storage.objects;
CREATE POLICY "Vehicle check photos: owner or same-org admin"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'vehicle-checks'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1
      FROM public.organisation_members om
      WHERE om.user_id = NULLIF((storage.foldername(name))[1], '')::uuid
        AND om.status = 'active'
        AND public.has_role_in_org(auth.uid(), om.org_id, 'admin'::public.app_role)
    )
  )
);
