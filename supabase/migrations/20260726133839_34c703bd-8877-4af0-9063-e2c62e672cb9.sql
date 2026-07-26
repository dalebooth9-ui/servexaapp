ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS what3words text,
  ADD COLUMN IF NOT EXISTS w3w_updated_at timestamptz;