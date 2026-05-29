ALTER TABLE public.job_schedule
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid NULL;

CREATE INDEX IF NOT EXISTS idx_job_schedule_date_ack
  ON public.job_schedule (schedule_date, acknowledged_at);