
-- Defects table for tracking deficiencies found during inspections
CREATE TABLE public.defects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  reported_by UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  photo_url TEXT,
  resolution_notes TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Validate severity and status
CREATE OR REPLACE FUNCTION public.validate_defect_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.severity NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Invalid defect severity: %', NEW.severity;
  END IF;
  IF NEW.status NOT IN ('open', 'in_progress', 'resolved', 'deferred') THEN
    RAISE EXCEPTION 'Invalid defect status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_defect
  BEFORE INSERT OR UPDATE ON public.defects
  FOR EACH ROW EXECUTE FUNCTION public.validate_defect_fields();

-- Updated_at trigger
CREATE TRIGGER trg_defects_updated_at
  BEFORE UPDATE ON public.defects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.defects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view defects"
  ON public.defects FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert defects"
  ON public.defects FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can update defects"
  ON public.defects FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR reported_by = auth.uid());

CREATE POLICY "Admins can delete defects"
  ON public.defects FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Quote approval tokens
CREATE TABLE public.quote_approval_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  responded_at TIMESTAMPTZ,
  response_notes TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  UNIQUE(token)
);

ALTER TABLE public.quote_approval_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view quote tokens"
  ON public.quote_approval_tokens FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage quote tokens"
  ON public.quote_approval_tokens FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update quote tokens"
  ON public.quote_approval_tokens FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Pre-seed fire industry inspection templates
INSERT INTO public.audit_templates (name, description, category, created_by) VALUES
  ('BS 5839 Fire Detection & Alarm — Weekly Test', 'Weekly test of fire detection and alarm systems per BS 5839-1:2017', 'fire_safety', NULL),
  ('BS 5839 Fire Detection & Alarm — Quarterly Inspection', 'Quarterly inspection per BS 5839-1:2017 Section 45', 'fire_safety', NULL),
  ('BS 5839 Fire Detection & Alarm — Annual Service', 'Annual service and inspection per BS 5839-1:2017', 'fire_safety', NULL),
  ('BS 5306-3 Fire Extinguisher Service', 'Annual service inspection per BS 5306-3:2017', 'fire_safety', NULL),
  ('BS EN 12845 Sprinkler System — Weekly Check', 'Weekly visual check per BS EN 12845:2015', 'fire_safety', NULL),
  ('BS EN 12845 Sprinkler System — Quarterly Inspection', 'Quarterly inspection per BS EN 12845:2015', 'fire_safety', NULL),
  ('BS 9990 Dry Riser — Visual Inspection', 'Six-monthly visual inspection per BS 9990:2015', 'fire_safety', NULL),
  ('BS 9990 Dry Riser — Pressure Test', 'Annual hydraulic pressure test per BS 9990:2015 (12 Bar / 15 mins)', 'fire_safety', NULL),
  ('BS 9990 Wet Riser — Visual Inspection', 'Six-monthly visual inspection of wet riser per BS 9990:2015', 'fire_safety', NULL),
  ('Emergency Lighting — Monthly Function Test', 'Monthly brief function test per BS 5266-1:2016', 'fire_safety', NULL),
  ('Emergency Lighting — Annual Duration Test', 'Annual full-duration test per BS 5266-1:2016', 'fire_safety', NULL)
ON CONFLICT DO NOTHING;
