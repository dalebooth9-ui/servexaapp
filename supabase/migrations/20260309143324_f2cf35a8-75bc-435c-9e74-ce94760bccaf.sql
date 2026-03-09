
-- Fix: Organisation Role Privilege Escalation via Overly Permissive INSERT Policy
-- Drop the policy that allows any authenticated user to insert themselves into ANY org with ANY role
DROP POLICY IF EXISTS "Users can insert themselves as org member" ON public.organisation_members;

-- Replace with a tightly scoped policy that only allows bootstrapping a brand-new org
-- (i.e. user_id must be the caller, role must be 'owner', and no active members exist yet in that org)
CREATE POLICY "Users can bootstrap own org as owner"
  ON public.organisation_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND NOT EXISTS (
      SELECT 1 FROM public.organisation_members m
      WHERE m.org_id = organisation_members.org_id
        AND m.status = 'active'
    )
  );
