ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS customer_po text;

-- Backfill: rows whose reference_number is clearly a customer PO
-- (does NOT match our auto-generated 'VFP-<digits>' or 'TM-<digits>' pattern).
UPDATE public.jobs
SET customer_po = reference_number
WHERE customer_po IS NULL
  AND reference_number IS NOT NULL
  AND reference_number !~ '^(VFP|TM)-[0-9]+$';

CREATE INDEX IF NOT EXISTS jobs_customer_po_idx
  ON public.jobs (customer_po)
  WHERE customer_po IS NOT NULL;