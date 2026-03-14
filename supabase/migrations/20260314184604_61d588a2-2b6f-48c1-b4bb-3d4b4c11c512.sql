
-- ============================================================
-- SECURITY FIX: 3 remaining issues
-- ============================================================

-- ---------------------------------------------------------------
-- 1. profile_names: recreate with security_invoker = true
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS public.profile_names;

CREATE VIEW public.profile_names
WITH (security_invoker = true)
AS
  SELECT user_id, full_name
  FROM public.profiles;

-- ---------------------------------------------------------------
-- 2. ORGANISATIONS: safe view hiding Stripe IDs from non-admins
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS public.organisations_safe;
DROP POLICY IF EXISTS "Org members can read own organisation" ON public.organisations;
DROP POLICY IF EXISTS "Organisation members can view their org" ON public.organisations;
DROP POLICY IF EXISTS "Members can view their organisation" ON public.organisations;
DROP POLICY IF EXISTS "Authenticated users can view their organisation" ON public.organisations;

CREATE POLICY "Org members can read own organisation"
  ON public.organisations FOR SELECT
  TO authenticated
  USING (user_belongs_to_org(id));

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
-- 3. APP SETTINGS: restrict to admins only
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can manage all settings" ON public.app_settings;

CREATE POLICY "Admins can read app_settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage app_settings"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
