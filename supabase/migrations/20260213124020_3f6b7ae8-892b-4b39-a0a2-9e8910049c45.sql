
-- 1. Add WITH CHECK to admin ALL policy on user_roles
DROP POLICY "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. Add WITH CHECK to admin ALL policy on job_assignments
DROP POLICY "Admins can manage assignments" ON public.job_assignments;
CREATE POLICY "Admins can manage assignments" ON public.job_assignments
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. Allow engineers to update their own submissions
CREATE POLICY "Engineers can update own submissions" ON public.submissions
  FOR UPDATE
  USING (engineer_id = auth.uid() AND EXISTS (
    SELECT 1 FROM job_assignments ja
    WHERE ja.job_id = submissions.job_id AND ja.engineer_id = auth.uid()
  ))
  WITH CHECK (engineer_id = auth.uid() AND EXISTS (
    SELECT 1 FROM job_assignments ja
    WHERE ja.job_id = submissions.job_id AND ja.engineer_id = auth.uid()
  ));

-- 4. Allow engineers to update status on their assigned jobs
CREATE POLICY "Engineers can update assigned jobs" ON public.jobs
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM job_assignments ja
    WHERE ja.job_id = jobs.id AND ja.engineer_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM job_assignments ja
    WHERE ja.job_id = jobs.id AND ja.engineer_id = auth.uid()
  ));
