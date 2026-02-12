
-- Replace overly permissive insert policy with a scoped one
DROP POLICY "System can insert submissions" ON public.submissions;
CREATE POLICY "Engineers can insert own submissions" ON public.submissions
  FOR INSERT TO authenticated
  WITH CHECK (engineer_id = auth.uid());
