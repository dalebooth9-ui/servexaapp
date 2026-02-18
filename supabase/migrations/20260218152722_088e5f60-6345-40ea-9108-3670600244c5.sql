
-- Create asset_categories table
CREATE TABLE public.asset_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;

-- Admins can manage
CREATE POLICY "Admins can manage asset categories"
  ON public.asset_categories FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- All authenticated can view
CREATE POLICY "Authenticated users can view asset categories"
  ON public.asset_categories FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Seed with existing hardcoded categories
INSERT INTO public.asset_categories (name, slug, sort_order) VALUES
  ('General', 'general', 0),
  ('HVAC', 'hvac', 1),
  ('Electrical', 'electrical', 2),
  ('Plumbing', 'plumbing', 3),
  ('Fire Safety', 'fire_safety', 4),
  ('Elevator', 'elevator', 5),
  ('Security', 'security', 6),
  ('IT Network', 'it_network', 7);
