ALTER TABLE public.job_schedule ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Backfill: incremental sort_order within each (engineer_id, schedule_date), ordered by created_at
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY engineer_id, schedule_date ORDER BY created_at, id) AS rn
  FROM public.job_schedule
  WHERE sort_order IS NULL
)
UPDATE public.job_schedule js
SET sort_order = ranked.rn
FROM ranked
WHERE js.id = ranked.id;

CREATE INDEX IF NOT EXISTS idx_job_schedule_day_sort
  ON public.job_schedule (engineer_id, schedule_date, sort_order);