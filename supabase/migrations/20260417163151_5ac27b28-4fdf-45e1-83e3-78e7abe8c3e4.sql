CREATE TABLE IF NOT EXISTS public.handover_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'pending',
  signed_at timestamptz,
  signature_data text,
  signer_name text,
  signer_email text,
  notes text,
  created_by uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_handover_tokens_token ON public.handover_tokens(token);
CREATE INDEX IF NOT EXISTS idx_handover_tokens_job ON public.handover_tokens(job_id);

ALTER TABLE public.handover_tokens ENABLE ROW LEVEL SECURITY;

-- Status validation
CREATE OR REPLACE FUNCTION public.validate_handover_token_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'signed', 'expired') THEN
    RAISE EXCEPTION 'Invalid handover status: %', NEW.status;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_handover_token_status ON public.handover_tokens;
CREATE TRIGGER trg_validate_handover_token_status
BEFORE INSERT OR UPDATE ON public.handover_tokens
FOR EACH ROW EXECUTE FUNCTION public.validate_handover_token_status();

-- Public read for the sign-off page (anyone holding the token in URL)
CREATE POLICY "Public can read by token"
ON public.handover_tokens FOR SELECT TO anon, authenticated
USING (true);

-- Public update (sign) — only allowed while still pending and not expired
CREATE POLICY "Public can sign pending tokens"
ON public.handover_tokens FOR UPDATE TO anon, authenticated
USING (status = 'pending' AND expires_at > now())
WITH CHECK (status IN ('pending', 'signed'));

-- Admins can do everything
CREATE POLICY "Admins manage handover tokens"
ON public.handover_tokens FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Engineers can create tokens for jobs assigned to them
CREATE POLICY "Engineers create tokens for assigned jobs"
ON public.handover_tokens FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.job_assignments ja
    WHERE ja.job_id = handover_tokens.job_id
      AND ja.engineer_id = auth.uid()
  )
);