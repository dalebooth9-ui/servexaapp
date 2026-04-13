
-- ============================================================
-- FIX 1: Organisations — hide Stripe fields from non-admin members
-- Recreate organisations_safe view WITH security_invoker = true
-- ============================================================
DROP VIEW IF EXISTS public.organisations_safe;

CREATE VIEW public.organisations_safe
WITH (security_invoker = true)
AS
SELECT
  id,
  name,
  slug,
  logo_url,
  primary_color,
  plan,
  plan_status,
  trial_ends_at,
  created_at,
  updated_at
FROM public.organisations;

REVOKE ALL ON public.organisations_safe FROM anon, PUBLIC;
GRANT SELECT ON public.organisations_safe TO authenticated;

-- Restrict direct SELECT on organisations to org admins only
-- Regular members should use organisations_safe view
DROP POLICY IF EXISTS "Org members can read own organisation" ON public.organisations;

CREATE POLICY "Org admins can read own organisation"
ON public.organisations
FOR SELECT
TO authenticated
USING (is_org_admin(id));

-- ============================================================
-- FIX 2: Profiles — scope admin access to same organisation
-- ============================================================
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Users can always read their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Admins can view profiles of users in the same organisation
CREATE POLICY "Admins can view org profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM organisation_members om
    WHERE om.user_id = profiles.user_id
      AND om.org_id = get_user_org_id()
      AND om.status = 'active'
  )
);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Admins can update profiles within their org
CREATE POLICY "Admins can update org profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM organisation_members om
    WHERE om.user_id = profiles.user_id
      AND om.org_id = get_user_org_id()
      AND om.status = 'active'
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM organisation_members om
    WHERE om.user_id = profiles.user_id
      AND om.org_id = get_user_org_id()
      AND om.status = 'active'
  )
);
