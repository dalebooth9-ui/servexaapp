-- Drop the existing overly-restrictive admin policy
DROP POLICY IF EXISTS "Admins can manage all job documents" ON public.job_documents;

-- Re-create it: allow any user with admin role to manage all job documents
-- (removes org_id dependency since organisation_members table is not in use)
CREATE POLICY "Admins can manage all job documents"
  ON public.job_documents
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  );