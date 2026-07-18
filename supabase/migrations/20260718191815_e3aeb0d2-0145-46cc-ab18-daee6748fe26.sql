DROP POLICY IF EXISTS "Vehicle check photos: owner or same-org admin" ON storage.objects;

CREATE POLICY "Vehicle check photos: owner or same-org admin"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'vehicle-checks'
  AND (
    owner = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.organisation_members om
      WHERE om.user_id = storage.objects.owner
        AND om.status = 'active'
        AND public.has_role_in_org(auth.uid(), om.org_id, 'admin'::public.app_role)
    )
  )
);