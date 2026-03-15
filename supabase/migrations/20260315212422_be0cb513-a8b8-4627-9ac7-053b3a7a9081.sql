
-- ============================================================
-- FIX: Scope admin access on profiles to same organisation only
-- ============================================================

-- Drop the existing unscoped admin policy
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Recreate with org-scoped filter: admins can only see profiles of
-- users who are members of the same organisation
CREATE POLICY "Admins can view profiles within their org"
ON public.profiles
FOR SELECT
USING (
  -- Users can always see their own profile
  user_id = auth.uid()
  OR
  -- Admins/owners can see profiles of users in the same org
  EXISTS (
    SELECT 1
    FROM public.organisation_members om_admin
    JOIN public.organisation_members om_target
      ON om_admin.org_id = om_target.org_id
    WHERE om_admin.user_id = auth.uid()
      AND om_admin.role IN ('owner', 'admin')
      AND om_admin.status = 'active'
      AND om_target.user_id = profiles.user_id
      AND om_target.status = 'active'
  )
);

-- ============================================================
-- FIX: Scope admin access on engineer_onboarding_logs to same org
-- ============================================================

-- Drop the existing unscoped admin policy
DROP POLICY IF EXISTS "Admins can view engineer_onboarding_logs" ON public.engineer_onboarding_logs;
DROP POLICY IF EXISTS "Admins can manage engineer_onboarding_logs" ON public.engineer_onboarding_logs;

-- Recreate with org-scoped filter: admins can only see onboarding logs
-- for engineers who are members of the same organisation
CREATE POLICY "Admins can view onboarding logs within their org"
ON public.engineer_onboarding_logs
FOR SELECT
USING (
  -- The user can see their own onboarding logs
  engineer_user_id = auth.uid()
  OR
  -- Admins/owners can only see logs for engineers in their own org
  EXISTS (
    SELECT 1
    FROM public.organisation_members om_admin
    JOIN public.organisation_members om_target
      ON om_admin.org_id = om_target.org_id
    WHERE om_admin.user_id = auth.uid()
      AND om_admin.role IN ('owner', 'admin')
      AND om_admin.status = 'active'
      AND om_target.user_id = engineer_onboarding_logs.engineer_user_id
      AND om_target.status = 'active'
  )
);

-- Retain insert ability for admins within their org
CREATE POLICY "Admins can insert onboarding logs within their org"
ON public.engineer_onboarding_logs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organisation_members om_admin
    JOIN public.organisation_members om_target
      ON om_admin.org_id = om_target.org_id
    WHERE om_admin.user_id = auth.uid()
      AND om_admin.role IN ('owner', 'admin')
      AND om_admin.status = 'active'
      AND om_target.user_id = engineer_onboarding_logs.engineer_user_id
      AND om_target.status = 'active'
  )
);
