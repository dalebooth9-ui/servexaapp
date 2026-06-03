-- Broaden engineer access to job documents so they can also view docs on jobs
-- they are scheduled or have a visit on, not just via job_assignments.
DROP POLICY IF EXISTS "Engineers can view job documents for assigned jobs" ON public.job_documents;

CREATE POLICY "Engineers can view job documents for their jobs"
ON public.job_documents
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = job_documents.job_id AND ja.engineer_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.job_schedule js WHERE js.job_id = job_documents.job_id AND js.engineer_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.job_visits jv WHERE jv.job_id = job_documents.job_id AND jv.engineer_id = auth.uid())
);