
-- Add customer_id FK column to jobs
ALTER TABLE public.jobs
ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

-- Backfill customer_id from existing customer text field
UPDATE public.jobs j
SET customer_id = c.id
FROM public.customers c
WHERE LOWER(TRIM(j.customer)) = LOWER(TRIM(c.name))
  AND j.customer IS NOT NULL
  AND j.customer_id IS NULL;

-- Create index for performance
CREATE INDEX idx_jobs_customer_id ON public.jobs(customer_id);
