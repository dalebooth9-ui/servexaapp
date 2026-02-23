
-- Add sort_order column for manual reordering
ALTER TABLE public.job_parts ADD COLUMN sort_order integer NOT NULL DEFAULT 0;

-- Backfill existing parts with sequential order based on created_at
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY created_at ASC) - 1 AS rn
  FROM public.job_parts
)
UPDATE public.job_parts SET sort_order = ordered.rn FROM ordered WHERE job_parts.id = ordered.id;
