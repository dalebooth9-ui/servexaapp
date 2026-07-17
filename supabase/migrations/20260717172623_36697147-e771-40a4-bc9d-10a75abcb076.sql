
-- 1. po-intake: scope admin SELECT to file's org
DROP POLICY IF EXISTS "Admins read po-intake for their org" ON storage.objects;
CREATE POLICY "Admins read po-intake for their org"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'po-intake'
  AND has_role_in_org(auth.uid(), storage_object_org_id(name), 'admin'::app_role)
);

-- 2. support-attachments: remove bare has_role('admin'); keep platform-admin escape hatch
DROP POLICY IF EXISTS "Users read own support attachments" ON storage.objects;
CREATE POLICY "Users read own support attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'support-attachments'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'::app_role)
  )
);

-- 3. asset-documents: use has_role_in_org scoped to file's org
DROP POLICY IF EXISTS "Org admins delete asset-documents" ON storage.objects;
CREATE POLICY "Org admins delete asset-documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'asset-documents'
  AND (storage.foldername(name))[1] = (get_user_org_id())::text
  AND has_role_in_org(auth.uid(), storage_object_org_id(name), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Org members upload asset-documents" ON storage.objects;
CREATE POLICY "Org members upload asset-documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'asset-documents'
  AND (storage.foldername(name))[1] = (get_user_org_id())::text
  AND (
    has_role_in_org(auth.uid(), storage_object_org_id(name), 'admin'::app_role)
    OR has_role_in_org(auth.uid(), storage_object_org_id(name), 'engineer'::app_role)
  )
);

DROP POLICY IF EXISTS "Org members view asset-documents" ON storage.objects;
CREATE POLICY "Org members view asset-documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'asset-documents'
  AND (storage.foldername(name))[1] = (get_user_org_id())::text
  AND (
    has_role_in_org(auth.uid(), storage_object_org_id(name), 'admin'::app_role)
    OR has_role_in_org(auth.uid(), storage_object_org_id(name), 'engineer'::app_role)
  )
);

-- 4. signatures: use org-scoped role checks
DROP POLICY IF EXISTS "Engineers can upload own signatures" ON storage.objects;
CREATE POLICY "Engineers can upload own signatures"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'signatures'
  AND has_role_in_org(auth.uid(), storage_object_org_id(name), 'engineer'::app_role)
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR ((storage.foldername(name))[2] = (auth.uid())::text AND user_can_access_storage_path(name))
  )
);

DROP POLICY IF EXISTS "Engineers can view signatures for assigned jobs" ON storage.objects;
CREATE POLICY "Engineers can view signatures for assigned jobs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'signatures'
  AND (
    has_role_in_org(auth.uid(), storage_object_org_id(name), 'admin'::app_role)
    OR (
      has_role_in_org(auth.uid(), storage_object_org_id(name), 'engineer'::app_role)
      AND (
        (storage.foldername(name))[1] = (auth.uid())::text
        OR (storage.foldername(name))[2] = (auth.uid())::text
        OR (
          user_can_access_storage_path(name)
          AND EXISTS (SELECT 1 FROM job_assignments ja WHERE ja.engineer_id = auth.uid())
        )
      )
    )
  )
);

-- 5 & 6. Restrict public read on customer-logos and templates to authenticated users only.
-- Bucket privacy is flipped via storage_update_bucket tool separately.
DROP POLICY IF EXISTS "Customer logos are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "public_read_customer_logos" ON storage.objects;
CREATE POLICY "Authenticated read customer-logos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'customer-logos');

DROP POLICY IF EXISTS "Public can read templates" ON storage.objects;
DROP POLICY IF EXISTS "public_read_templates" ON storage.objects;
CREATE POLICY "Authenticated read templates"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'templates');
