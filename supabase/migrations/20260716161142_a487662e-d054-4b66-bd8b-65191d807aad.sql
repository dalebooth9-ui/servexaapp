
-- 1) organisations: restrict INSERT to platform-org admins only
DROP POLICY IF EXISTS "Only platform admins can create organisations" ON public.organisations;
CREATE POLICY "Only platform admins can create organisations"
ON public.organisations
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'::public.app_role)
);

-- 2) quote_approval_tokens: add missing org-scoped admin SELECT policy
DROP POLICY IF EXISTS "Admins select quote tokens in org" ON public.quote_approval_tokens;
CREATE POLICY "Admins select quote tokens in org"
ON public.quote_approval_tokens
FOR SELECT
TO authenticated
USING (
  org_id = public.get_user_org_id()
  AND public.has_role_in_org(auth.uid(), org_id, 'admin'::public.app_role)
);

-- 3) storage.objects: rewrite bare admin policies to be org-scoped
DROP POLICY IF EXISTS "Admins can manage all signatures" ON storage.objects;
CREATE POLICY "Admins can manage signatures in own org"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'signatures'
  AND public.has_role_in_org(auth.uid(), public.storage_object_org_id(name), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'signatures'
  AND public.has_role_in_org(auth.uid(), public.storage_object_org_id(name), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Admins can manage customer paperwork files" ON storage.objects;
CREATE POLICY "Admins can manage customer paperwork in own org"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'customer-paperwork'
  AND public.has_role_in_org(auth.uid(), public.storage_object_org_id(name), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'customer-paperwork'
  AND public.has_role_in_org(auth.uid(), public.storage_object_org_id(name), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Admins can manage engineer document files" ON storage.objects;
CREATE POLICY "Admins can manage engineer documents in own org"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'engineer-documents'
  AND public.has_role_in_org(auth.uid(), public.storage_object_org_id(name), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'engineer-documents'
  AND public.has_role_in_org(auth.uid(), public.storage_object_org_id(name), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Admins manage po-intake for their org" ON storage.objects;
CREATE POLICY "Admins manage po-intake in own org"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'po-intake'
  AND public.has_role_in_org(auth.uid(), public.storage_object_org_id(name), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'po-intake'
  AND public.has_role_in_org(auth.uid(), public.storage_object_org_id(name), 'admin'::public.app_role)
);

-- vehicle-checks: path is {user_id}/..., not {org_id}/... — scope admin fallback to admins of the uploader's org
DROP POLICY IF EXISTS "Engineers can view their own vehicle check photos" ON storage.objects;
CREATE POLICY "Vehicle check photos: owner or same-org admin"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'vehicle-checks'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1
      FROM public.organisation_members om_uploader
      JOIN public.organisation_members om_viewer
        ON om_viewer.org_id = om_uploader.org_id
       AND om_viewer.user_id = auth.uid()
       AND om_viewer.status = 'active'
      WHERE om_uploader.user_id = ((storage.foldername(name))[1])::uuid
        AND om_uploader.status = 'active'
        AND public.has_role_in_org(auth.uid(), om_viewer.org_id, 'admin'::public.app_role)
    )
  )
);
