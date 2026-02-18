
CREATE TABLE public.audit_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage audit categories"
  ON public.audit_categories FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view audit categories"
  ON public.audit_categories FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Seed with existing hardcoded categories
INSERT INTO public.audit_categories (name, slug, sort_order) VALUES
  ('General', 'general', 0),
  ('Fire Safety', 'fire_safety', 1),
  ('Health & Safety', 'health_safety', 2),
  ('Electrical', 'electrical', 3),
  ('Water Hygiene', 'water_hygiene', 4),
  ('HVAC', 'hvac', 5),
  ('Building Fabric', 'building_fabric', 6);
