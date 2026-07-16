
-- Add flags to jobs for email chain notifications
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS has_unread_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_review_flag boolean NOT NULL DEFAULT false;

-- Per-job inbound/outbound email chain
CREATE TABLE IF NOT EXISTS public.job_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  direction text NOT NULL DEFAULT 'inbound',
  from_email text,
  to_emails text[],
  subject text,
  snippet text,
  body_text text,
  body_html text,
  message_id text,
  in_reply_to text,
  eml_path text,
  attachment_count int NOT NULL DEFAULT 0,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_emails TO authenticated;
GRANT ALL ON public.job_emails TO service_role;

ALTER TABLE public.job_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read job emails"
ON public.job_emails FOR SELECT
TO authenticated
USING (public.user_belongs_to_org(org_id));

CREATE POLICY "Admins can manage job emails"
ON public.job_emails FOR ALL
TO authenticated
USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE INDEX IF NOT EXISTS job_emails_job_id_received_idx
  ON public.job_emails (job_id, received_at DESC);
CREATE INDEX IF NOT EXISTS job_emails_message_id_idx
  ON public.job_emails (message_id);
