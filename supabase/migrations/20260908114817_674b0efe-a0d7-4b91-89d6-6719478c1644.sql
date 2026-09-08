ALTER TABLE public.help_articles
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS audience text[] NOT NULL DEFAULT ARRAY['admin','engineer']::text[],
  ADD COLUMN IF NOT EXISTS guide_order integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS is_guide boolean NOT NULL DEFAULT false;