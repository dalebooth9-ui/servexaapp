CREATE TABLE IF NOT EXISTS public.freeagent_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  company_url text NOT NULL,
  company_name text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  connection_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, company_url)
);

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS freeagent_invoice_id text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS freeagent_synced_at timestamptz;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS freeagent_contact_id text;

REVOKE ALL ON public.freeagent_connections FROM anon, authenticated;
GRANT ALL ON public.freeagent_connections TO service_role;

ALTER TABLE public.freeagent_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages freeagent connections" ON public.freeagent_connections;
CREATE POLICY "Service role manages freeagent connections"
  ON public.freeagent_connections FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_freeagent_connections_updated_at ON public.freeagent_connections;
CREATE TRIGGER update_freeagent_connections_updated_at
  BEFORE UPDATE ON public.freeagent_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_invoices_freeagent_invoice_id ON public.invoices(freeagent_invoice_id);
CREATE INDEX IF NOT EXISTS idx_customers_freeagent_contact_id ON public.customers(freeagent_contact_id);