DROP POLICY IF EXISTS "Engineers can read customer paperwork files" ON storage.objects;

CREATE POLICY "Engineers can read customer paperwork files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'customer-paperwork'
  AND has_role_in_org(auth.uid(), storage_object_org_id(name), 'engineer'::app_role)
  AND EXISTS (
    SELECT 1
    FROM customer_paperwork cp
    JOIN jobs j ON j.customer_id = cp.customer_id
    JOIN job_assignments ja ON ja.job_id = j.id
    WHERE ja.engineer_id = auth.uid()
      AND cp.file_url = storage.objects.name
  )
);