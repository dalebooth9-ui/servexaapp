
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS outlets_count integer NULL,
  ADD COLUMN IF NOT EXISTS riser_location text NULL;
