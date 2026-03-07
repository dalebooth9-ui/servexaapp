ALTER TABLE public.conformity_certificates
  ADD COLUMN IF NOT EXISTS inlet_qty integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS outlet_qty integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS pressure_bar integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS pressure_duration integer NOT NULL DEFAULT 15;