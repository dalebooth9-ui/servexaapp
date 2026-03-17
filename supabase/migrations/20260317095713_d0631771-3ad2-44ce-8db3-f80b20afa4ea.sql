
-- Fix profiles visibility: admins should see all profiles even without organisation_members rows
-- The org_members table is empty so the join-based policy hides everyone

DROP POLICY IF EXISTS "Admins can view profiles within their org" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Also fix the UPDATE policy which requires org membership
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Admins can update all profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
  );
