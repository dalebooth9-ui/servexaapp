
-- profiles: drop the org-restricted admin policies and replace with simple admin role checks
DROP POLICY IF EXISTS "Admins can view org profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update org profiles" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- submissions: drop the org-restricted admin ALL policy and replace
DROP POLICY IF EXISTS "Admins can manage all submissions" ON public.submissions;

CREATE POLICY "Admins can manage all submissions"
  ON public.submissions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- job_assignments: ensure admins can SELECT (the existing ALL policy should cover this but let's add an explicit SELECT for safety)
DROP POLICY IF EXISTS "Admins can view all assignments" ON public.job_assignments;
CREATE POLICY "Admins can view all assignments"
  ON public.job_assignments FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
