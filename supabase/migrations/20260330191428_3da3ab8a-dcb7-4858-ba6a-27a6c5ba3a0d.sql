
-- Fix 1: Drop and recreate organisations_safe view without stripe columns
DROP VIEW IF EXISTS public.organisations_safe;

CREATE VIEW public.organisations_safe AS
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
FROM organisations
WHERE user_belongs_to_org(id);
