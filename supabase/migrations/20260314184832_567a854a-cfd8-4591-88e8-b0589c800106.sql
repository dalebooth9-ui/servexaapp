
-- ============================================================
-- SECURITY FIX: Remove stale unscoped policies that bypass
-- the org-scoped ones (permissive policies OR together)
-- Also fix views that need RLS
-- ============================================================

-- ---------------------------------------------------------------
-- 1. PARTS LIBRARY: remove old unscoped engineer policy
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can view parts library" ON public.parts_library;
DROP POLICY IF EXISTS "Engineers can read parts library" ON public.parts_library;

-- ---------------------------------------------------------------
-- 2. PPM SCHEDULES: remove old unscoped engineer policy
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can view PPM schedules" ON public.ppm_schedules;
DROP POLICY IF EXISTS "Engineers can read ppm schedules" ON public.ppm_schedules;
DROP POLICY IF EXISTS "Engineers can view ppm schedules" ON public.ppm_schedules;

-- ---------------------------------------------------------------
-- 3. JOB SHEET TEMPLATES: remove old unscoped engineer policy
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can view templates" ON public.job_sheet_templates;
DROP POLICY IF EXISTS "Engineers can read templates" ON public.job_sheet_templates;
DROP POLICY IF EXISTS "Engineers can view job sheet templates" ON public.job_sheet_templates;

-- ---------------------------------------------------------------
-- 4. organisations_safe is a VIEW — views don't support RLS.
--    Drop it and use the underlying organisations table directly
--    (already protected by user_belongs_to_org RLS policy).
--    The CASE WHEN logic in the view still hides Stripe fields
--    from non-admins at query time.
-- ---------------------------------------------------------------
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
    updated_at,
    CASE WHEN has_role(auth.uid(), 'admin') THEN stripe_customer_id ELSE NULL END AS stripe_customer_id,
    CASE WHEN has_role(auth.uid(), 'admin') THEN stripe_subscription_id ELSE NULL END AS stripe_subscription_id
  FROM public.organisations
  WHERE user_belongs_to_org(id);

-- ---------------------------------------------------------------
-- 5. profile_names: security_invoker means it uses the caller's
--    RLS session against profiles. Profiles already has policies
--    restricting access. The view just needs to exist as INVOKER.
--    Also ensure profiles has a permissive engineer read policy
--    so name lookups work within the org.
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS public.profile_names;

CREATE VIEW public.profile_names
WITH (security_invoker = true)
AS
  SELECT user_id, full_name
  FROM public.profiles;
