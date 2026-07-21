
-- Scope read access on org-scoped storage buckets to the object's owning org.
-- Legacy objects without an org-prefix in the path fall back to platform_admin visibility
-- so operators can still recover them without leaking cross-tenant data.

DROP POLICY IF EXISTS "Authenticated read customer-logos" ON storage.objects;
CREATE POLICY "Org members read customer-logos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'customer-logos'
  AND (
    public.storage_object_org_id(name) = public.get_user_org_id()
    OR public.has_role(auth.uid(), 'platform_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Authenticated read templates" ON storage.objects;
CREATE POLICY "Org members read templates"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'templates'
  AND (
    public.storage_object_org_id(name) = public.get_user_org_id()
    OR public.has_role(auth.uid(), 'platform_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Authenticated read blank-template-pdfs" ON storage.objects;
CREATE POLICY "Org members read blank-template-pdfs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'blank-template-pdfs'
  AND (
    public.storage_object_org_id(name) = public.get_user_org_id()
    OR public.has_role(auth.uid(), 'platform_admin'::public.app_role)
  )
);
