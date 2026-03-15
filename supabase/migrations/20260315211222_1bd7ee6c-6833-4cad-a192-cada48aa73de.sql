-- Drop and recreate profile_names view with security_invoker = true
-- This ensures the view enforces the RLS policies of the underlying profiles table,
-- preventing unauthenticated or unauthorized access to user identity data.
DROP VIEW IF EXISTS public.profile_names;

CREATE VIEW public.profile_names
WITH (security_invoker = true)
AS
  SELECT user_id, full_name
  FROM public.profiles;

-- Revoke access from anon role to prevent unauthenticated enumeration
REVOKE ALL ON public.profile_names FROM anon;
GRANT SELECT ON public.profile_names TO authenticated;