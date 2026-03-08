
-- Make schedule_date nullable to support unallocated labour entries
ALTER TABLE public.planner_adhoc_entries
  ALTER COLUMN schedule_date DROP NOT NULL;

-- Add allocated_days column
ALTER TABLE public.planner_adhoc_entries
  ADD COLUMN IF NOT EXISTS allocated_days integer NOT NULL DEFAULT 1;
