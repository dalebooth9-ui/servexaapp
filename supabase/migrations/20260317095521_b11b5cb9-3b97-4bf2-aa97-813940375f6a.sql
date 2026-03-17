
-- 1. Add missing DELETE policy for admins on jobs (this is why deletes were failing silently)
DROP POLICY IF EXISTS "Admins can delete jobs" ON public.jobs;
CREATE POLICY "Admins can delete jobs"
  ON public.jobs
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND (org_id = get_user_org_id() OR org_id IS NULL));

-- 2. Fix engineers assignment SELECT policy - ensure no recursion path
DROP POLICY IF EXISTS "Engineers can view own assignments" ON public.job_assignments;
CREATE POLICY "Engineers can view own assignments"
  ON public.job_assignments
  FOR SELECT
  TO authenticated
  USING (engineer_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- 3. Add missing DELETE policy for admins on customers
DROP POLICY IF EXISTS "Admins can delete customers" ON public.customers;
CREATE POLICY "Admins can delete customers"
  ON public.customers
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
