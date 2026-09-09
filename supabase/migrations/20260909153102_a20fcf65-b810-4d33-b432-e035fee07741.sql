CREATE TABLE IF NOT EXISTS public.quickbooks_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  realm_id text NOT NULL,
  company_name text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  connection_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, realm_id)
);

REVOKE ALL ON public.quickbooks_connections FROM anon, authenticated;
GRANT ALL ON public.quickbooks_connections TO service_role;

ALTER TABLE public.quickbooks_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages quickbooks_connections" ON public.quickbooks_connections;
CREATE POLICY "Service role manages quickbooks_connections"
  ON public.quickbooks_connections FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_quickbooks_connections_updated_at ON public.quickbooks_connections;
CREATE TRIGGER update_quickbooks_connections_updated_at
  BEFORE UPDATE ON public.quickbooks_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.accounting_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  provider text NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.accounting_sync_log TO authenticated;
GRANT ALL ON public.accounting_sync_log TO service_role;

ALTER TABLE public.accounting_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins read accounting_sync_log" ON public.accounting_sync_log;
CREATE POLICY "Org admins read accounting_sync_log"
  ON public.accounting_sync_log FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS accounting_sync_log_org_provider
  ON public.accounting_sync_log (org_id, provider, created_at DESC);

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS quickbooks_invoice_id text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS quickbooks_synced_at timestamptz;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS quickbooks_contact_id text;
ALTER TABLE public.price_book_items ADD COLUMN IF NOT EXISTS quickbooks_item_id text;