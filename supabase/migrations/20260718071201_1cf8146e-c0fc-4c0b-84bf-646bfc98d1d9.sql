
ALTER TABLE public.organisation_billing
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS plan_code text NOT NULL DEFAULT 'pro_monthly',
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_webhook_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS organisation_billing_org_id_key ON public.organisation_billing(org_id);
CREATE INDEX IF NOT EXISTS organisation_billing_customer_idx ON public.organisation_billing(stripe_customer_id);
CREATE INDEX IF NOT EXISTS organisation_billing_subscription_idx ON public.organisation_billing(stripe_subscription_id);

ALTER TABLE public.organisation_billing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_billing_admin_select" ON public.organisation_billing;
CREATE POLICY "org_billing_admin_select" ON public.organisation_billing
  FOR SELECT TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

DROP POLICY IF EXISTS "org_billing_platform_admin_select" ON public.organisation_billing;
CREATE POLICY "org_billing_platform_admin_select" ON public.organisation_billing
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role));

GRANT SELECT ON public.organisation_billing TO authenticated;
GRANT ALL ON public.organisation_billing TO service_role;

CREATE TABLE IF NOT EXISTS public.platform_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  max_uses integer NOT NULL DEFAULT 1,
  uses integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  seed_templates_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_invite_codes TO authenticated;
GRANT ALL ON public.platform_invite_codes TO service_role;

ALTER TABLE public.platform_invite_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_invite_codes_platform_admin_all" ON public.platform_invite_codes;
CREATE POLICY "platform_invite_codes_platform_admin_all" ON public.platform_invite_codes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS platform_invite_codes_updated_at ON public.platform_invite_codes;
CREATE TRIGGER platform_invite_codes_updated_at BEFORE UPDATE ON public.platform_invite_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.signup_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code text,
  org_name text,
  seed_templates boolean NOT NULL DEFAULT true,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  org_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signup_intents_email_idx ON public.signup_intents(email);
CREATE INDEX IF NOT EXISTS signup_intents_code_idx ON public.signup_intents(code);

GRANT SELECT ON public.signup_intents TO authenticated;
GRANT ALL ON public.signup_intents TO service_role;

ALTER TABLE public.signup_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signup_intents_platform_admin_select" ON public.signup_intents;
CREATE POLICY "signup_intents_platform_admin_select" ON public.signup_intents
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE OR REPLACE FUNCTION public.preview_signup_code(_code text)
RETURNS TABLE(valid boolean, note text, seed_templates_default boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (c.id IS NOT NULL AND c.is_active AND (c.expires_at IS NULL OR c.expires_at > now()) AND c.uses < c.max_uses) AS valid,
    c.note,
    COALESCE(c.seed_templates_default, true)
  FROM public.platform_invite_codes c
  WHERE c.code = _code
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.preview_signup_code(text) TO anon, authenticated;
