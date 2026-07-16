
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS intake_message_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS intake_normalized_subject text,
  ADD COLUMN IF NOT EXISTS intake_sender_email text,
  ADD COLUMN IF NOT EXISTS intake_sender_domain text,
  ADD COLUMN IF NOT EXISTS intake_last_email_at timestamptz;

CREATE INDEX IF NOT EXISTS jobs_intake_message_ids_gin
  ON public.jobs USING GIN (intake_message_ids);

CREATE INDEX IF NOT EXISTS jobs_intake_thread_lookup
  ON public.jobs (org_id, status, intake_normalized_subject, intake_sender_domain)
  WHERE status = 'pending_review';
