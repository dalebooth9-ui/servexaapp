
-- 1) Revoke column-level SELECT on raw token columns from client roles
REVOKE SELECT (token) ON public.customer_portal_tokens FROM authenticated, anon;
REVOKE SELECT (token) ON public.customer_sign_off_tokens FROM authenticated, anon;
REVOKE SELECT (token) ON public.fire_log_tokens FROM authenticated, anon;
REVOKE SELECT (token) ON public.handover_tokens FROM authenticated, anon;
REVOKE SELECT (token) ON public.installation_handover_tokens FROM authenticated, anon;
REVOKE SELECT (token) ON public.quote_approval_tokens FROM authenticated, anon;

-- 2) Revoke Stripe ID columns on organisations from client roles
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.organisations FROM authenticated, anon;

-- 3) Admin helpers (SECURITY DEFINER, role-gated)

-- Customer portal tokens
CREATE OR REPLACE FUNCTION public.admin_list_customer_portal_tokens(_customer_id uuid)
RETURNS TABLE (
  id uuid, token text, customer_email text, is_active boolean,
  last_accessed timestamptz, created_at timestamptz, expires_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  RETURN QUERY
  SELECT t.id, t.token, t.customer_email, t.is_active, t.last_accessed, t.created_at, t.expires_at
  FROM public.customer_portal_tokens t
  WHERE t.customer_id = _customer_id
  ORDER BY t.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_create_customer_portal_token(_customer_id uuid, _customer_email text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _token text; _org_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  SELECT org_id INTO _org_id FROM public.customers WHERE id = _customer_id;
  INSERT INTO public.customer_portal_tokens (customer_id, customer_email, created_by, org_id)
  VALUES (_customer_id, _customer_email, auth.uid(), _org_id)
  RETURNING token INTO _token;
  RETURN _token;
END; $$;

-- Handover tokens
CREATE OR REPLACE FUNCTION public.admin_get_latest_handover_token(_job_id uuid)
RETURNS TABLE (
  id uuid, token text, status text, signed_at timestamptz,
  signer_name text, signature_data text, expires_at timestamptz,
  customer_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  RETURN QUERY
  SELECT t.id, t.token, t.status, t.signed_at, t.signer_name, t.signature_data, t.expires_at, t.customer_id
  FROM public.handover_tokens t
  WHERE t.job_id = _job_id
  ORDER BY t.created_at DESC
  LIMIT 1;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_create_handover_token(_job_id uuid, _customer_id uuid, _signer_name text, _signer_email text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _token text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  INSERT INTO public.handover_tokens (job_id, customer_id, signer_name, signer_email, created_by)
  VALUES (_job_id, _customer_id, _signer_name, _signer_email, auth.uid())
  RETURNING token INTO _token;
  RETURN _token;
END; $$;

-- Public RPC for signing a handover by token (replaces direct table update on public sign-off page)
CREATE OR REPLACE FUNCTION public.sign_handover_token(_token text, _signer_name text, _signer_email text, _notes text, _signature_data text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _updated int;
BEGIN
  UPDATE public.handover_tokens
     SET status = 'signed',
         signature_data = _signature_data,
         signer_name = _signer_name,
         signer_email = _signer_email,
         notes = _notes,
         signed_at = now()
   WHERE token = _token
     AND status = 'pending'
     AND expires_at > now();
  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated > 0;
END; $$;

-- Fire log tokens
CREATE OR REPLACE FUNCTION public.admin_list_fire_log_tokens(_site_id uuid)
RETURNS TABLE (id uuid, token text, is_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  RETURN QUERY
  SELECT t.id, t.token, t.is_active
  FROM public.fire_log_tokens t
  WHERE t.site_id = _site_id
  ORDER BY t.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_create_fire_log_token(_site_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _token text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  INSERT INTO public.fire_log_tokens (site_id, created_by)
  VALUES (_site_id, auth.uid())
  RETURNING token INTO _token;
  RETURN _token;
END; $$;

-- Quote approval tokens
CREATE OR REPLACE FUNCTION public.admin_create_quote_approval_token(_quote_id uuid, _customer_name text, _customer_email text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _token text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  INSERT INTO public.quote_approval_tokens (quote_id, customer_name, customer_email, created_by)
  VALUES (_quote_id, _customer_name, _customer_email, auth.uid())
  RETURNING token INTO _token;
  RETURN _token;
END; $$;

-- Installation handover tokens
CREATE OR REPLACE FUNCTION public.admin_create_installation_handover_token(_project_id uuid, _job_id uuid, _client_name text, _client_email text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _token text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  INSERT INTO public.installation_handover_tokens (project_id, job_id, created_by, client_name, client_email)
  VALUES (_project_id, _job_id, auth.uid(), _client_name, _client_email)
  RETURNING token INTO _token;
  RETURN _token;
END; $$;

-- 4) Grants for the new RPCs
GRANT EXECUTE ON FUNCTION public.admin_list_customer_portal_tokens(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_customer_portal_token(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_latest_handover_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_handover_token(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_fire_log_tokens(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_fire_log_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_quote_approval_token(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_installation_handover_token(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sign_handover_token(text, text, text, text, text) TO anon, authenticated;
