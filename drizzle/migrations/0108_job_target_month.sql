ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS target_month date;
COMMENT ON COLUMN public.jobs.target_month IS 'Provisional booking month (first day of month). Cleared when the job is given a planner day.';
CREATE INDEX IF NOT EXISTS jobs_target_month_idx ON public.jobs(target_month) WHERE target_month IS NOT NULL;