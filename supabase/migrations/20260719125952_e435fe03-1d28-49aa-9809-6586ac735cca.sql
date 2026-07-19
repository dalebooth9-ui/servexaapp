
-- engineer_documents SELECT
DROP POLICY IF EXISTS "Engineers can view own documents" ON public.engineer_documents;
CREATE POLICY "Engineers can view own documents" ON public.engineer_documents
FOR SELECT TO authenticated
USING (engineer_id = auth.uid() AND org_id = get_user_org_id());

-- engineer_signatures SELECT
DROP POLICY IF EXISTS "Org members read engineer_signatures" ON public.engineer_signatures;
CREATE POLICY "Org members read engineer_signatures" ON public.engineer_signatures
FOR SELECT TO authenticated
USING (org_id = get_user_org_id());

-- engineer_onboarding_logs INSERT standardised on has_role_in_org
DROP POLICY IF EXISTS "Admins can insert onboarding logs within their org" ON public.engineer_onboarding_logs;
CREATE POLICY "Admins can insert onboarding logs within their org" ON public.engineer_onboarding_logs
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organisation_members om_target
    WHERE om_target.user_id = engineer_onboarding_logs.engineer_user_id
      AND om_target.status = 'active'
      AND public.has_role_in_org(auth.uid(), om_target.org_id, 'admin'::app_role)
  )
);

-- storage: site-survey-media
DROP POLICY IF EXISTS "Admins or owner read site-survey-media" ON storage.objects;
CREATE POLICY "Admins or owner read site-survey-media" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'site-survey-media' AND (owner = auth.uid() OR (storage_object_org_id(name) = get_user_org_id() AND has_role_in_org(auth.uid(), get_user_org_id(), 'admin'::app_role))));

DROP POLICY IF EXISTS "Admins or owner update site-survey-media" ON storage.objects;
CREATE POLICY "Admins or owner update site-survey-media" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'site-survey-media' AND (owner = auth.uid() OR (storage_object_org_id(name) = get_user_org_id() AND has_role_in_org(auth.uid(), get_user_org_id(), 'admin'::app_role))));

DROP POLICY IF EXISTS "Admins or owner delete site-survey-media" ON storage.objects;
CREATE POLICY "Admins or owner delete site-survey-media" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'site-survey-media' AND (owner = auth.uid() OR (storage_object_org_id(name) = get_user_org_id() AND has_role_in_org(auth.uid(), get_user_org_id(), 'admin'::app_role))));

DROP POLICY IF EXISTS "Authenticated upload own site-survey-media" ON storage.objects;
CREATE POLICY "Authenticated upload own site-survey-media" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'site-survey-media' AND owner = auth.uid() AND storage_object_org_id(name) = get_user_org_id());

-- storage: signatures
DROP POLICY IF EXISTS "Engineers can upload own signatures" ON storage.objects;
CREATE POLICY "Engineers can upload own signatures" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'signatures'
  AND has_role_in_org(auth.uid(), storage_object_org_id(name), 'engineer'::app_role)
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR ((storage.foldername(name))[2] = (auth.uid())::text AND user_can_access_storage_path(name))
  )
);

DROP POLICY IF EXISTS "Engineers can view signatures for assigned jobs" ON storage.objects;
CREATE POLICY "Engineers can view signatures for assigned jobs" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'signatures'
  AND (
    has_role_in_org(auth.uid(), storage_object_org_id(name), 'admin'::app_role)
    OR (
      has_role_in_org(auth.uid(), storage_object_org_id(name), 'engineer'::app_role)
      AND (
        (storage.foldername(name))[1] = (auth.uid())::text
        OR (storage.foldername(name))[2] = (auth.uid())::text
        OR (user_can_access_storage_path(name) AND EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.engineer_id = auth.uid()))
      )
    )
  )
);

-- storage: vehicle-checks
DROP POLICY IF EXISTS "Engineers can upload their own vehicle check photos" ON storage.objects;
CREATE POLICY "Engineers can upload their own vehicle check photos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vehicle-checks'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND EXISTS (SELECT 1 FROM public.organisation_members om WHERE om.user_id = auth.uid() AND om.status = 'active')
);

DROP POLICY IF EXISTS "Vehicle check photos: owner or same-org admin" ON storage.objects;
CREATE POLICY "Vehicle check photos: owner or same-org admin" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'vehicle-checks'
  AND (
    owner = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.user_id = objects.owner
        AND om.status = 'active'
        AND has_role_in_org(auth.uid(), om.org_id, 'admin'::app_role)
    )
  )
);

-- storage: asset-documents
DROP POLICY IF EXISTS "Org members view asset-documents" ON storage.objects;
CREATE POLICY "Org members view asset-documents" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'asset-documents'
  AND (storage.foldername(name))[1] = (get_user_org_id())::text
  AND (
    has_role_in_org(auth.uid(), storage_object_org_id(name), 'admin'::app_role)
    OR has_role_in_org(auth.uid(), storage_object_org_id(name), 'engineer'::app_role)
  )
);

DROP POLICY IF EXISTS "Org members upload asset-documents" ON storage.objects;
CREATE POLICY "Org members upload asset-documents" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'asset-documents'
  AND (storage.foldername(name))[1] = (get_user_org_id())::text
  AND (
    has_role_in_org(auth.uid(), storage_object_org_id(name), 'admin'::app_role)
    OR has_role_in_org(auth.uid(), storage_object_org_id(name), 'engineer'::app_role)
  )
);

DROP POLICY IF EXISTS "Org admins delete asset-documents" ON storage.objects;
CREATE POLICY "Org admins delete asset-documents" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'asset-documents'
  AND (storage.foldername(name))[1] = (get_user_org_id())::text
  AND has_role_in_org(auth.uid(), storage_object_org_id(name), 'admin'::app_role)
);
