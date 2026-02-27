
-- Create dedicated customer_sites join table
CREATE TABLE public.customer_sites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (customer_id, site_id)
);

-- Enable RLS
ALTER TABLE public.customer_sites ENABLE ROW LEVEL SECURITY;

-- Admins can manage all customer_sites
CREATE POLICY "Admins can manage all customer_sites"
ON public.customer_sites FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Engineers can view customer_sites
CREATE POLICY "Engineers can view customer_sites"
ON public.customer_sites FOR SELECT
USING (has_role(auth.uid(), 'engineer'::app_role));

-- Migrate existing placeholder job links into customer_sites
INSERT INTO public.customer_sites (customer_id, site_id, created_by)
SELECT DISTINCT customer_id, site_id, created_by
FROM public.jobs
WHERE name LIKE 'Site link —%'
  AND customer_id IS NOT NULL
  AND site_id IS NOT NULL
ON CONFLICT (customer_id, site_id) DO NOTHING;

-- Delete all placeholder jobs now that data is migrated
DELETE FROM public.jobs WHERE name LIKE 'Site link —%';
