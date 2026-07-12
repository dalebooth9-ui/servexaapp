
-- Admins can read files under {org_id}/... in po-intake bucket
CREATE POLICY "Admins read po-intake for their org"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'po-intake'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins manage po-intake for their org"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'po-intake'
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  bucket_id = 'po-intake'
  AND public.has_role(auth.uid(), 'admin')
);
