
-- Store Xero OAuth tokens per user
CREATE TABLE public.xero_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  tenant_name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

ALTER TABLE public.xero_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage xero connections"
  ON public.xero_connections FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_xero_connections_updated_at
  BEFORE UPDATE ON public.xero_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add xero_invoice_id to invoices for tracking synced invoices
ALTER TABLE public.invoices ADD COLUMN xero_invoice_id TEXT;
ALTER TABLE public.invoices ADD COLUMN xero_synced_at TIMESTAMP WITH TIME ZONE;

-- Add xero_contact_id to customers for tracking synced contacts
ALTER TABLE public.customers ADD COLUMN xero_contact_id TEXT;
