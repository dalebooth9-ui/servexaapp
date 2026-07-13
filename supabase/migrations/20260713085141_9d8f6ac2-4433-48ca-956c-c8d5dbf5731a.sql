ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_override_reason text;

CREATE INDEX IF NOT EXISTS idx_jobs_completed_at ON public.jobs(completed_at);