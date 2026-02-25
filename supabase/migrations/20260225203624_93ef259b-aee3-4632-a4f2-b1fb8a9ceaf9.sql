
-- Job messages table for in-app messaging
CREATE TABLE public.job_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read_by uuid[] NOT NULL DEFAULT '{}'
);

ALTER TABLE public.job_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all job messages"
  ON public.job_messages FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view messages for assigned jobs"
  ON public.job_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.job_assignments ja
    WHERE ja.job_id = job_messages.job_id AND ja.engineer_id = auth.uid()
  ));

CREATE POLICY "Engineers can send messages on assigned jobs"
  ON public.job_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.job_assignments ja
      WHERE ja.job_id = job_messages.job_id AND ja.engineer_id = auth.uid()
    )
  );

CREATE POLICY "Engineers can update read_by on assigned jobs"
  ON public.job_messages FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.job_assignments ja
    WHERE ja.job_id = job_messages.job_id AND ja.engineer_id = auth.uid()
  ));

ALTER PUBLICATION supabase_realtime ADD TABLE public.job_messages;

-- Customer portal tokens table for passwordless customer access
CREATE TABLE public.customer_portal_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_by uuid NOT NULL,
  customer_email text NOT NULL,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_portal_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage customer portal tokens"
  ON public.customer_portal_tokens FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow public read by token (for portal access)
CREATE POLICY "Public can read valid tokens"
  ON public.customer_portal_tokens FOR SELECT
  USING (expires_at > now());
