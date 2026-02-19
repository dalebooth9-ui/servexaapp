
-- Create parts library table
CREATE TABLE public.parts_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  sell_price NUMERIC NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'general',
  supplier TEXT,
  part_number TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.parts_library ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins can manage parts library"
ON public.parts_library FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Engineers can view
CREATE POLICY "Engineers can view parts library"
ON public.parts_library FOR SELECT
USING (has_role(auth.uid(), 'engineer'::app_role));

-- Engineers can add parts
CREATE POLICY "Engineers can add to parts library"
ON public.parts_library FOR INSERT
WITH CHECK (has_role(auth.uid(), 'engineer'::app_role) AND created_by = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_parts_library_updated_at
BEFORE UPDATE ON public.parts_library
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for search
CREATE INDEX idx_parts_library_name ON public.parts_library USING gin(to_tsvector('english', name));
CREATE INDEX idx_parts_library_category ON public.parts_library(category);
CREATE INDEX idx_parts_library_part_number ON public.parts_library(part_number);
