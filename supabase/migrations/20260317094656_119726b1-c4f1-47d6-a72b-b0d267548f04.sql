
-- Fix infinite recursion: job_assignments policy was querying jobs,
-- while jobs policies query job_assignments → circular dependency.

-- Drop the problematic policies
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.job_assignments;
DROP POLICY IF EXISTS "Engineers can view assigned jobs" ON public.jobs;
DROP POLICY IF EXISTS "Engineers can update assigned jobs" ON public.jobs;

-- Recreate job_assignments admin policy WITHOUT referencing jobs table
CREATE POLICY "Admins can manage assignments"
  ON public.job_assignments
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Recreate jobs policies for engineers (jobs → job_assignments is fine now that job_assignments no longer loops back to jobs)
CREATE POLICY "Engineers can view assigned jobs"
  ON public.jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_assignments ja
      WHERE ja.job_id = jobs.id
        AND ja.engineer_id = auth.uid()
    )
  );

CREATE POLICY "Engineers can update assigned jobs"
  ON public.jobs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_assignments ja
      WHERE ja.job_id = jobs.id
        AND ja.engineer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.job_assignments ja
      WHERE ja.job_id = jobs.id
        AND ja.engineer_id = auth.uid()
    )
  );

-- Fix customers: add fallback for users with no org so org_id IS NULL rows are always visible
DROP POLICY IF EXISTS "Org members can read customers" ON public.customers;
CREATE POLICY "Org members can read customers"
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'engineer'::app_role)
    OR org_id IS NULL
  );
