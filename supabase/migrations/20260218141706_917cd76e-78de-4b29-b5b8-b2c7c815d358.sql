
-- Customer sign-off tokens for shareable links
CREATE TABLE public.customer_sign_off_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  customer_name text NOT NULL DEFAULT '',
  customer_email text,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '30 days'),
  signed_at timestamp with time zone,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customer_sign_off_tokens ENABLE ROW LEVEL SECURITY;

-- Admins can manage all tokens
CREATE POLICY "Admins can manage all sign-off tokens"
  ON public.customer_sign_off_tokens FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Engineers can view tokens for assigned jobs
CREATE POLICY "Engineers can view sign-off tokens for assigned jobs"
  ON public.customer_sign_off_tokens FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM job_assignments ja
    WHERE ja.job_id = customer_sign_off_tokens.job_id AND ja.engineer_id = auth.uid()
  ));

-- Engineers can create tokens for assigned jobs
CREATE POLICY "Engineers can create sign-off tokens for assigned jobs"
  ON public.customer_sign_off_tokens FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM job_assignments ja
      WHERE ja.job_id = customer_sign_off_tokens.job_id AND ja.engineer_id = auth.uid()
    )
  );
