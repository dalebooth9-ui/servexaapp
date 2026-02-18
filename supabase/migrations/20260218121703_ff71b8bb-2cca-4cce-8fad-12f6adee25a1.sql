
-- Sites hierarchy: single self-referencing table with type
CREATE TABLE public.sites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  site_type text NOT NULL DEFAULT 'site',
  parent_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  address text,
  postcode text,
  contact_name text,
  contact_phone text,
  contact_email text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Validate site_type
CREATE OR REPLACE FUNCTION public.validate_site_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.site_type NOT IN ('region', 'site', 'building', 'zone') THEN
    RAISE EXCEPTION 'Invalid site type: %. Must be region, site, building, or zone.', NEW.site_type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_site_type
  BEFORE INSERT OR UPDATE ON public.sites
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_site_type();

-- Updated_at trigger
CREATE TRIGGER update_sites_updated_at
  BEFORE UPDATE ON public.sites
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all sites"
  ON public.sites FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view sites"
  ON public.sites FOR SELECT
  USING (has_role(auth.uid(), 'engineer'::app_role));

-- Assets table
CREATE TABLE public.assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  asset_tag text UNIQUE,
  category text NOT NULL DEFAULT 'general',
  make text,
  model text,
  serial_number text,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  install_date date,
  warranty_expiry date,
  status text NOT NULL DEFAULT 'operational',
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Validate asset status
CREATE OR REPLACE FUNCTION public.validate_asset_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('operational', 'maintenance', 'faulty', 'decommissioned') THEN
    RAISE EXCEPTION 'Invalid asset status: %. Must be operational, maintenance, faulty, or decommissioned.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_asset_status
  BEFORE INSERT OR UPDATE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_asset_status();

CREATE TRIGGER update_assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all assets"
  ON public.assets FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view assets"
  ON public.assets FOR SELECT
  USING (has_role(auth.uid(), 'engineer'::app_role));

-- Add asset_id column to jobs for linking
ALTER TABLE public.jobs ADD COLUMN asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL;
-- Add site_id column to jobs for linking
ALTER TABLE public.jobs ADD COLUMN site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX idx_sites_parent_id ON public.sites(parent_id);
CREATE INDEX idx_sites_site_type ON public.sites(site_type);
CREATE INDEX idx_assets_site_id ON public.assets(site_id);
CREATE INDEX idx_assets_status ON public.assets(status);
CREATE INDEX idx_jobs_asset_id ON public.jobs(asset_id);
CREATE INDEX idx_jobs_site_id ON public.jobs(site_id);
