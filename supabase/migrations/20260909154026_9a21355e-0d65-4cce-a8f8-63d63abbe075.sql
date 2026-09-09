CREATE TABLE IF NOT EXISTS public.sage_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  business_id text NOT NULL,
  business_name text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  connection_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, business_id)
);

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sage_invoice_id text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sage_synced_at timestamptz;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS sage_contact_id text;
ALTER TABLE public.price_book_items ADD COLUMN IF NOT EXISTS sage_product_id text;

REVOKE ALL ON public.sage_connections FROM anon, authenticated;
GRANT ALL ON public.sage_connections TO service_role;

ALTER TABLE public.sage_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages sage connections"
  ON public.sage_connections FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_sage_connections_updated_at ON public.sage_connections;
CREATE TRIGGER update_sage_connections_updated_at
  BEFORE UPDATE ON public.sage_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_invoices_sage_invoice_id ON public.invoices (sage_invoice_id) WHERE sage_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_sage_contact_id ON public.customers (sage_contact_id) WHERE sage_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_price_book_items_sage_product_id ON public.price_book_items (sage_product_id) WHERE sage_product_id IS NOT NULL;