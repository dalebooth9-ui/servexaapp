-- 1. customer_portal_tokens: drop public SELECT, add admin SELECT
DROP POLICY IF EXISTS "Public can validate active tokens" ON public.customer_portal_tokens;

CREATE POLICY "Admins can read customer portal tokens"
ON public.customer_portal_tokens
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (org_id IS NULL OR user_belongs_to_org(org_id))
);

-- 2. fire_log_tokens: drop public SELECT
DROP POLICY IF EXISTS "Public can read active fire log tokens" ON public.fire_log_tokens;

-- 3. handover_tokens: drop public SELECT (USING true)
DROP POLICY IF EXISTS "Public can read by token" ON public.handover_tokens;

-- 4. RPC: lookup a fire log token by its value
CREATE OR REPLACE FUNCTION public.get_fire_log_token_by_value(_token text)
RETURNS TABLE (id uuid, site_id uuid, is_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.site_id, t.is_active
  FROM public.fire_log_tokens t
  WHERE t.token = _token AND t.is_active = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_fire_log_token_by_value(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fire_log_token_by_value(text) TO anon, authenticated;

-- 5. RPC: lookup a handover token by its value
CREATE OR REPLACE FUNCTION public.get_handover_token_by_value(_token text)
RETURNS TABLE (
  id uuid,
  job_id uuid,
  customer_id uuid,
  org_id uuid,
  token text,
  status text,
  expires_at timestamptz,
  signed_at timestamptz,
  signer_name text,
  signer_email text,
  signature_data text,
  notes text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.job_id, t.customer_id, t.org_id, t.token, t.status,
         t.expires_at, t.signed_at, t.signer_name, t.signer_email,
         t.signature_data, t.notes, t.created_at
  FROM public.handover_tokens t
  WHERE t.token = _token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_handover_token_by_value(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_handover_token_by_value(text) TO anon, authenticated;

-- 6. RPC for customer portal: active fire log tokens for the customer's sites
CREATE OR REPLACE FUNCTION public.get_portal_fire_log_tokens(_portal_token text)
RETURNS TABLE (site_id uuid, token text, is_active boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  SELECT cpt.customer_id INTO v_customer_id
  FROM public.customer_portal_tokens cpt
  WHERE cpt.token = _portal_token
    AND cpt.is_active = true
    AND (cpt.expires_at IS NULL OR cpt.expires_at > now())
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT flt.site_id, flt.token, flt.is_active
  FROM public.fire_log_tokens flt
  JOIN public.customer_sites cs ON cs.site_id = flt.site_id
  WHERE cs.customer_id = v_customer_id
    AND flt.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_portal_fire_log_tokens(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_fire_log_tokens(text) TO anon, authenticated;

-- 7. RPC for customer portal: sign-off tokens for the customer's jobs
CREATE OR REPLACE FUNCTION public.get_portal_handover_tokens(_portal_token text)
RETURNS TABLE (
  id uuid,
  job_id uuid,
  status text,
  signed_at timestamptz,
  signer_name text,
  created_at timestamptz,
  token text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  SELECT cpt.customer_id INTO v_customer_id
  FROM public.customer_portal_tokens cpt
  WHERE cpt.token = _portal_token
    AND cpt.is_active = true
    AND (cpt.expires_at IS NULL OR cpt.expires_at > now())
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT h.id, h.job_id, h.status, h.signed_at, h.signer_name, h.created_at, h.token
  FROM public.handover_tokens h
  JOIN public.jobs j ON j.id = h.job_id
  WHERE j.customer_id = v_customer_id
  ORDER BY h.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_portal_handover_tokens(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_handover_tokens(text) TO anon, authenticated;