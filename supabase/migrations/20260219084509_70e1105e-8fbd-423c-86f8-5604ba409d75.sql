CREATE POLICY "Engineers can delete own submissions"
ON public.submissions
FOR DELETE
USING (
  (engineer_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM job_assignments ja
    WHERE ja.job_id = submissions.job_id AND ja.engineer_id = auth.uid()
  )
);