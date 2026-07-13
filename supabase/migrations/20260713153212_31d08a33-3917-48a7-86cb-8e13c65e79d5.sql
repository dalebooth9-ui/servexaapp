
-- 1. Customer paperwork storage: exact path match
DROP POLICY IF EXISTS "Engineers can read customer paperwork files" ON storage.objects;
CREATE POLICY "Engineers can read customer paperwork files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'customer-paperwork'
  AND public.has_role(auth.uid(), 'engineer'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.customer_paperwork cp
    JOIN public.jobs j ON j.customer_id = cp.customer_id
    JOIN public.job_assignments ja ON ja.job_id = j.id
    WHERE ja.engineer_id = auth.uid()
      AND cp.file_url = storage.objects.name
  )
);

-- 2. Submissions storage: exact suffix match (file_url may be a full URL or bare path)
DROP POLICY IF EXISTS "Authenticated users can view assigned submission files" ON storage.objects;
CREATE POLICY "Authenticated users can view assigned submission files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'submissions'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.submissions s
      JOIN public.job_assignments ja ON s.job_id = ja.job_id
      WHERE ja.engineer_id = auth.uid()
        AND (
          s.file_url = storage.objects.name
          OR s.file_url LIKE '%/' || storage.objects.name
        )
    )
  )
);

-- 3. Explicit belt-and-braces: no anon/public read of raw sign-off tokens.
-- Restrictive policy blocks anon SELECT regardless of any other permissive rule.
DROP POLICY IF EXISTS "Deny anon read of customer_sign_off_tokens" ON public.customer_sign_off_tokens;
CREATE POLICY "Deny anon read of customer_sign_off_tokens"
ON public.customer_sign_off_tokens
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);

REVOKE SELECT ON public.customer_sign_off_tokens FROM anon;
