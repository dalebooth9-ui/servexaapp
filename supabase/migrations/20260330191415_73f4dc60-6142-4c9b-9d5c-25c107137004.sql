
-- Fix 2: Tighten customer-paperwork storage SELECT policy for engineers
DROP POLICY IF EXISTS "Engineers can read customer paperwork files" ON storage.objects;

CREATE POLICY "Engineers can read customer paperwork files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'customer-paperwork'
  AND has_role(auth.uid(), 'engineer'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.customer_paperwork cp
    JOIN public.jobs j ON j.customer_id = cp.customer_id
    JOIN public.job_assignments ja ON ja.job_id = j.id
    WHERE ja.engineer_id = auth.uid()
      AND storage.filename(name) = cp.file_name
  )
);
