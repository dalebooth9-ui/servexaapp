
-- 1. Fix quote_approval_tokens: restrict SELECT to admins only
DROP POLICY IF EXISTS "Authenticated users can view quote tokens" ON public.quote_approval_tokens;
CREATE POLICY "Admins can view quote tokens"
  ON public.quote_approval_tokens
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. Fix asset-documents storage: restrict SELECT/INSERT to authenticated users with admin or org membership
DROP POLICY IF EXISTS "Authenticated users can view asset documents" ON storage.objects;
CREATE POLICY "Authenticated users can view asset documents"
  ON storage.objects
  FOR SELECT
  TO public
  USING (
    bucket_id = 'asset-documents'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'engineer'::app_role))
  );

DROP POLICY IF EXISTS "Authenticated users can upload asset documents" ON storage.objects;
CREATE POLICY "Authenticated users can upload asset documents"
  ON storage.objects
  FOR INSERT
  TO public
  WITH CHECK (
    bucket_id = 'asset-documents'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'engineer'::app_role))
  );

DROP POLICY IF EXISTS "Authenticated users can upload compliance docs" ON storage.objects;
CREATE POLICY "Authenticated users can upload compliance docs"
  ON storage.objects
  FOR INSERT
  TO public
  WITH CHECK (
    bucket_id = 'asset-documents'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'engineer'::app_role))
  );

-- 3. Fix customer-paperwork: replace fragile filename join with path-based check
DROP POLICY IF EXISTS "Engineers can read customer paperwork files" ON storage.objects;
CREATE POLICY "Engineers can read customer paperwork files"
  ON storage.objects
  FOR SELECT
  TO public
  USING (
    bucket_id = 'customer-paperwork'
    AND has_role(auth.uid(), 'engineer'::app_role)
    AND EXISTS (
      SELECT 1
      FROM customer_paperwork cp
        JOIN jobs j ON j.customer_id = cp.customer_id
        JOIN job_assignments ja ON ja.job_id = j.id
      WHERE ja.engineer_id = auth.uid()
        AND cp.file_url LIKE '%' || name || '%'
    )
  );
