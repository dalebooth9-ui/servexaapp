
-- ============================================================
-- FIX: Ensure organisations_safe view enforces caller's RLS context
-- ============================================================

-- Recreate the view with security_invoker = true so that any
-- access to the underlying organisations table is governed by
-- the caller's own RLS session, not the view owner's privileges.
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
    CASE
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN stripe_customer_id
      ELSE NULL::text
    END AS stripe_customer_id,
    CASE
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN stripe_subscription_id
      ELSE NULL::text
    END AS stripe_subscription_id
  FROM public.organisations
  WHERE public.user_belongs_to_org(id);

-- Prevent unauthenticated (anon) callers from querying this view
REVOKE ALL ON public.organisations_safe FROM anon;
GRANT SELECT ON public.organisations_safe TO authenticated;
