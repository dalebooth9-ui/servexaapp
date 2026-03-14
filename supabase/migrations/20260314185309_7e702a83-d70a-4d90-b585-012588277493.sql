
-- Revoke column-level SELECT on Stripe fields from the authenticated role
-- so engineers cannot read them even via the organisations table directly.
REVOKE SELECT ON public.organisations FROM authenticated;

GRANT SELECT (id, name, slug, logo_url, primary_color, plan, plan_status, trial_ends_at, created_at, updated_at)
  ON public.organisations TO authenticated;

-- Admins get full access via service role / edge functions.
-- In client code we use organisations_safe view which is SECURITY INVOKER
-- and applies CASE WHEN has_role for Stripe fields.
