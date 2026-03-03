-- Fix customer_portal_tokens: remove public read policy (tokens validated via service role in edge function)
DROP POLICY IF EXISTS "Public can read valid tokens" ON public.customer_portal_tokens;

-- Restrict nextval_ppm_seq: revoke public execute so only service role/triggers can call it
REVOKE EXECUTE ON FUNCTION public.nextval_ppm_seq() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.nextval_ppm_seq() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.nextval_ppm_seq() FROM anon;