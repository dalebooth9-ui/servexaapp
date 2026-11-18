ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS po_value numeric;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_po text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS xero_sync_error text;
UPDATE public.jobs SET po_value = (substring(brief from 'PO value:\s*(?:[A-Z]{3}\s+)?([0-9]+(?:\.[0-9]+)?)'))::numeric
WHERE po_value IS NULL AND brief ~ 'PO value:\s*(?:[A-Z]{3}\s+)?[0-9]';
UPDATE public.invoices i SET customer_po = j.customer_po FROM public.jobs j
WHERE i.job_id = j.id AND i.customer_po IS NULL AND COALESCE(j.customer_po,'') <> '';