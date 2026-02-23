-- Add sort_order column to parts_library
ALTER TABLE public.parts_library ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Backfill existing rows based on name alphabetical order
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name ASC) - 1 AS rn
  FROM public.parts_library
)
UPDATE public.parts_library SET sort_order = ranked.rn
FROM ranked WHERE public.parts_library.id = ranked.id;
