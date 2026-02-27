ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS other_service_type text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS other_qty integer NOT NULL DEFAULT 0;

ALTER TABLE public.job_templates
  ADD COLUMN IF NOT EXISTS other_service_type text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS other_qty integer NOT NULL DEFAULT 0;