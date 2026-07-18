
ALTER TABLE public.platform_invite_codes
  ADD COLUMN IF NOT EXISTS price_override_pence integer,
  ADD COLUMN IF NOT EXISTS price_override_note text;

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS promo_price_pence integer,
  ADD COLUMN IF NOT EXISTS promo_price_note text,
  ADD COLUMN IF NOT EXISTS user_band text;

DROP FUNCTION IF EXISTS public.preview_signup_code(text);

CREATE FUNCTION public.preview_signup_code(_code text)
RETURNS TABLE(valid boolean, note text, seed_templates_default boolean, price_override_pence integer, price_override_note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (c.id IS NOT NULL AND c.is_active AND (c.expires_at IS NULL OR c.expires_at > now()) AND c.uses < c.max_uses) AS valid,
    c.note,
    COALESCE(c.seed_templates_default, true),
    c.price_override_pence,
    c.price_override_note
  FROM public.platform_invite_codes c
  WHERE c.code = _code
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.preview_signup_code(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.count_org_staff_users(_org_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.profiles p WHERE p.org_id = _org_id;
$$;

GRANT EXECUTE ON FUNCTION public.count_org_staff_users(uuid) TO authenticated, service_role;
