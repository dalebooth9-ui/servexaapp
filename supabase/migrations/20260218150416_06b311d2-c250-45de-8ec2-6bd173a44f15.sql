
-- Create job_categories table
CREATE TABLE public.job_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.job_categories ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read categories
CREATE POLICY "Authenticated users can view job categories"
ON public.job_categories FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only admins can manage categories
CREATE POLICY "Admins can manage job categories"
ON public.job_categories FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed with existing hardcoded categories
INSERT INTO public.job_categories (name, slug, sort_order) VALUES
  ('General', 'general', 0),
  ('Installation', 'installation', 1),
  ('Maintenance', 'maintenance', 2),
  ('Inspection', 'inspection', 3),
  ('Survey', 'survey', 4);
