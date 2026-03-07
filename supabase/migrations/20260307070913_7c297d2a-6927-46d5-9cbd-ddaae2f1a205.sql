
-- Fix security definer view issue - recreate with SECURITY INVOKER
DROP VIEW IF EXISTS public.profile_names;

CREATE OR REPLACE VIEW public.profile_names
WITH (security_invoker = true) AS
  SELECT user_id, full_name
  FROM public.profiles;

GRANT SELECT ON public.profile_names TO authenticated;
