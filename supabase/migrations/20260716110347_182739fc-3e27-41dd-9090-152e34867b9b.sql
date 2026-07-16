ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS display_order integer;
CREATE INDEX IF NOT EXISTS submissions_job_display_order_idx ON public.submissions (job_id, display_order);