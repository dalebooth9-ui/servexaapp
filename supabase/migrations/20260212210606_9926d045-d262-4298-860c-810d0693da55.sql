
-- 1. Fix the critical bug: Engineers can view assigned jobs policy
--    ja.job_id = ja.id should be ja.job_id = jobs.id
DROP POLICY IF EXISTS "Engineers can view assigned jobs" ON public.jobs;
CREATE POLICY "Engineers can view assigned jobs"
  ON public.jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM job_assignments ja
      WHERE ja.job_id = jobs.id AND ja.engineer_id = auth.uid()
    )
  );

-- 2. Restrict submissions: engineers should only see submissions for their assigned jobs
--    (not all their own submissions across all jobs)
DROP POLICY IF EXISTS "Engineers can view own submissions" ON public.submissions;
CREATE POLICY "Engineers can view own submissions"
  ON public.submissions
  FOR SELECT
  USING (
    engineer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM job_assignments ja
      WHERE ja.job_id = submissions.job_id AND ja.engineer_id = auth.uid()
    )
  );

-- 3. Tighten submission inserts to only assigned jobs
DROP POLICY IF EXISTS "Engineers can insert own submissions" ON public.submissions;
CREATE POLICY "Engineers can insert own submissions"
  ON public.submissions
  FOR INSERT
  WITH CHECK (
    engineer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM job_assignments ja
      WHERE ja.job_id = submissions.job_id AND ja.engineer_id = auth.uid()
    )
  );
