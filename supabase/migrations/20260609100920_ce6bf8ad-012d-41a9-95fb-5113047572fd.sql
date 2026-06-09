
-- 1) Hide Stripe identifiers from client-side reads on organisations
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.organisations FROM authenticated, anon;
REVOKE UPDATE (stripe_customer_id, stripe_subscription_id) ON public.organisations FROM authenticated, anon;

-- 2) Scope published job sheet templates to caller's org (or global templates)
DROP POLICY IF EXISTS "Engineers can view published job sheet templates" ON public.job_sheet_templates;
CREATE POLICY "Engineers can view published job sheet templates"
  ON public.job_sheet_templates
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(status, 'published') = 'published'
    AND (org_id IS NULL OR org_id = public.get_user_org_id())
  );

-- 3) Customer sign-off tokens: stop exposing raw token via SELECT; provide SECURITY DEFINER RPC
DROP POLICY IF EXISTS "Engineers can view sign-off tokens for assigned jobs" ON public.customer_sign_off_tokens;

CREATE OR REPLACE FUNCTION public.create_customer_sign_off_token(
  _job_id uuid,
  _customer_name text,
  _customer_email text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _token text;
  _allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.job_assignments ja
      WHERE ja.job_id = _job_id AND ja.engineer_id = auth.uid()
    )
  INTO _allowed;

  IF NOT _allowed THEN
    RAISE EXCEPTION 'Not authorised for this job';
  END IF;

  INSERT INTO public.customer_sign_off_tokens (job_id, customer_name, customer_email, created_by)
  VALUES (_job_id, _customer_name, _customer_email, auth.uid())
  RETURNING token INTO _token;

  RETURN _token;
END;
$$;

REVOKE ALL ON FUNCTION public.create_customer_sign_off_token(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_customer_sign_off_token(uuid, text, text) TO authenticated;

-- 4) xero_connections: explicit deny for client roles; service role only
REVOKE ALL ON public.xero_connections FROM anon, authenticated;
GRANT ALL ON public.xero_connections TO service_role;
CREATE POLICY "Service role only"
  ON public.xero_connections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
