
-- Drop and recreate profile_names with security_invoker=true
-- This ensures RLS on the profiles table is enforced when the view is queried
DROP VIEW IF EXISTS public.profile_names;
CREATE VIEW public.profile_names
  WITH (security_invoker = true)
  AS
  SELECT user_id, full_name
  FROM public.profiles;

-- Drop and recreate organisations_safe with security_invoker=true
-- This ensures RLS on the organisations table is enforced when the view is queried
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
  WHERE user_belongs_to_org(id);
