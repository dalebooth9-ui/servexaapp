
-- Extend customer_portal_tokens with org_id, is_active, last_accessed
ALTER TABLE public.customer_portal_tokens
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_accessed timestamptz;

CREATE INDEX IF NOT EXISTS idx_customer_portal_tokens_token ON public.customer_portal_tokens(token);
CREATE INDEX IF NOT EXISTS idx_customer_portal_tokens_customer ON public.customer_portal_tokens(customer_id);

-- Backfill org_id from customers
UPDATE public.customer_portal_tokens t
SET org_id = c.org_id
FROM public.customers c
WHERE t.customer_id = c.id AND t.org_id IS NULL;

-- Drop old policies and rebuild
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='customer_portal_tokens'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.customer_portal_tokens', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.customer_portal_tokens ENABLE ROW LEVEL SECURITY;

-- Public can SELECT only active tokens (validation happens via edge function with service role anyway)
CREATE POLICY "Public can validate active tokens"
  ON public.customer_portal_tokens FOR SELECT
  USING (is_active = true);

-- Admins manage tokens in their own org
CREATE POLICY "Admins manage org tokens (insert)"
  ON public.customer_portal_tokens FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND (org_id IS NULL OR public.user_belongs_to_org(org_id))
  );

CREATE POLICY "Admins manage org tokens (update)"
  ON public.customer_portal_tokens FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND (org_id IS NULL OR public.user_belongs_to_org(org_id))
  );

CREATE POLICY "Admins manage org tokens (delete)"
  ON public.customer_portal_tokens FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND (org_id IS NULL OR public.user_belongs_to_org(org_id))
  );
