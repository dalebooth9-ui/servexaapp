-- Drop the overly broad policy that exposes all invitation tokens to anon/any user
DROP POLICY IF EXISTS "Anyone can view an invitation by token (validated in code)"
  ON public.organisation_invitations;

-- The invitation acceptance edge function uses the service role key to look up tokens,
-- so no client-side SELECT policy is needed for the public invite acceptance flow.
-- Only authenticated org members should be able to view invitations for their org.

CREATE POLICY "Org members can view their org invitations"
  ON public.organisation_invitations FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_org(org_id));