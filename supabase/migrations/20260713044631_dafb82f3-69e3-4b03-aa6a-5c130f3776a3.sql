
-- Idempotent cleanup in case a previous attempt left partial objects
DROP TABLE IF EXISTS public.vehicles CASCADE;
DROP FUNCTION IF EXISTS public.normalise_vehicle_registration() CASCADE;

CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111'::uuid,
  registration text NOT NULL,
  label text,
  make text,
  model text,
  default_engineer_id uuid,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE OR REPLACE FUNCTION public.normalise_vehicle_registration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.registration := upper(regexp_replace(coalesce(NEW.registration,''), '\s+', '', 'g'));
  IF NEW.registration = '' THEN
    RAISE EXCEPTION 'Vehicle registration is required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vehicles_normalise_reg
BEFORE INSERT OR UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.normalise_vehicle_registration();

CREATE TRIGGER vehicles_touch_updated_at
BEFORE UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX vehicles_org_registration_key
  ON public.vehicles (org_id, registration);
CREATE INDEX vehicles_org_active_idx
  ON public.vehicles (org_id, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view vehicles"
ON public.vehicles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can add vehicles"
ON public.vehicles FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update vehicles"
ON public.vehicles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete vehicles"
ON public.vehicles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.vehicle_checks
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS vehicle_checks_vehicle_id_idx
  ON public.vehicle_checks (vehicle_id);

-- Backfill vehicles: one row per (org_id, normalised reg), default engineer = most recent checker
WITH normalised AS (
  SELECT
    org_id,
    upper(regexp_replace(vehicle_reg, '\s+', '', 'g')) AS reg,
    engineer_id,
    created_at
  FROM public.vehicle_checks
  WHERE vehicle_reg IS NOT NULL AND trim(vehicle_reg) <> ''
),
ranked AS (
  SELECT org_id, reg, engineer_id,
         ROW_NUMBER() OVER (PARTITION BY org_id, reg ORDER BY created_at DESC) AS rn
  FROM normalised
)
INSERT INTO public.vehicles (org_id, registration, default_engineer_id, active)
SELECT org_id, reg, engineer_id, true
FROM ranked
WHERE rn = 1
ON CONFLICT (org_id, registration) DO NOTHING;

-- Backfill vehicle_id link on existing checks
UPDATE public.vehicle_checks vc
SET vehicle_id = v.id
FROM public.vehicles v
WHERE v.org_id = vc.org_id
  AND v.registration = upper(regexp_replace(coalesce(vc.vehicle_reg,''),'\s+','','g'))
  AND vc.vehicle_id IS NULL;
