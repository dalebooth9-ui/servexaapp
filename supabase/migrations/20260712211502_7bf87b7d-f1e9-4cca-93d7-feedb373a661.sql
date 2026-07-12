-- Restore safe column-level SELECT on organisations for authenticated users.
-- The previous security migration revoked all column privileges, which caused
-- select * (and even narrow selects) from the client to fail with permission denied.
-- RLS still restricts row access to org admins via the existing policy.
GRANT SELECT (
  id, name, slug, intake_email, logo_url, primary_color,
  plan, plan_status, trial_ends_at, created_at, updated_at
) ON public.organisations TO authenticated;

GRANT UPDATE (
  name, slug, logo_url, primary_color, intake_email
) ON public.organisations TO authenticated;

GRANT ALL ON public.organisations TO service_role;
GRANT SELECT ON public.organisations_safe TO authenticated;
GRANT ALL ON public.organisations_safe TO service_role;