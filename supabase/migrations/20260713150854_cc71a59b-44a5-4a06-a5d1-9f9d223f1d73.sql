-- ────────────────────────────────────────────────────────────────────────────
-- Per-org PO intake secrets. Each row lets one org receive PO-intake webhook
-- calls without sharing a global secret. The secret itself is stored hashed
-- (sha256 hex) so even an admin reading the table can't recover it.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_intake_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  secret_hash text NOT NULL,          -- sha256 hex of the secret
  label text,                          -- e.g. "Zapier — main mailbox"
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE (org_id, secret_hash)
);

CREATE INDEX IF NOT EXISTS org_intake_secrets_org_idx
  ON public.org_intake_secrets (org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_intake_secrets TO authenticated;
GRANT ALL ON public.org_intake_secrets TO service_role;

ALTER TABLE public.org_intake_secrets ENABLE ROW LEVEL SECURITY;

-- Org admins can see (metadata only — never the plaintext, only the hash) and
-- manage rows for their own org. We deliberately don't expose secret_hash to
-- anon; every policy is scoped by is_org_admin.
CREATE POLICY "org admins manage own intake secrets"
  ON public.org_intake_secrets FOR ALL
  TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- ────────────────────────────────────────────────────────────────────────────
-- Verifier used by the po-intake edge function. Runs as SECURITY DEFINER so
-- the service-role edge function doesn't have to see the hashes directly.
-- Uses digest() from pgcrypto (already enabled by the platform).
-- Returns true only when a matching row exists.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_org_intake_secret(_org_id uuid, _secret text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_ok boolean := false;
BEGIN
  IF _org_id IS NULL OR _secret IS NULL OR length(_secret) < 16 THEN
    RETURN false;
  END IF;
  v_hash := encode(extensions.digest(_secret, 'sha256'), 'hex');
  SELECT true INTO v_ok
    FROM public.org_intake_secrets
   WHERE org_id = _org_id
     AND secret_hash = v_hash
   LIMIT 1;
  IF v_ok THEN
    -- Best-effort touch of last_used_at; ignore failures so verification
    -- never fails on a write error.
    BEGIN
      UPDATE public.org_intake_secrets
         SET last_used_at = now()
       WHERE org_id = _org_id
         AND secret_hash = v_hash;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN COALESCE(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_org_intake_secret(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_org_intake_secret(uuid, text) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- Helper for the settings UI: create a new secret. Takes the plaintext,
-- hashes it, stores the hash, and returns nothing (the caller already knows
-- the plaintext they supplied). Restricted to org admins.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_org_intake_secret(_org_id uuid, _secret text, _label text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_org_admin(_org_id) THEN
    RAISE EXCEPTION 'Not authorised for this org';
  END IF;
  IF _secret IS NULL OR length(_secret) < 24 THEN
    RAISE EXCEPTION 'Secret must be at least 24 characters';
  END IF;
  INSERT INTO public.org_intake_secrets (org_id, secret_hash, label, created_by)
  VALUES (_org_id, encode(extensions.digest(_secret, 'sha256'), 'hex'), _label, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_org_intake_secret(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_org_intake_secret(uuid, text, text) TO authenticated;
