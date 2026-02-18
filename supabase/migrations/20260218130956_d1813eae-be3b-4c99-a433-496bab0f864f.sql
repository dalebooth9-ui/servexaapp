
-- Engineer live locations for real-time tracking
CREATE TABLE public.engineer_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  heading double precision,
  speed double precision,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.engineer_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all engineer locations"
  ON public.engineer_locations FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can upsert own location"
  ON public.engineer_locations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Engineers can update own location"
  ON public.engineer_locations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Engineers can view own location"
  ON public.engineer_locations FOR SELECT
  USING (auth.uid() = user_id);

-- Enable realtime for live tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.engineer_locations;

-- Customer notification log
CREATE TABLE public.customer_notification_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  customer_email text NOT NULL,
  notification_type text NOT NULL,
  subject text NOT NULL,
  sent_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage notification logs"
  ON public.customer_notification_log FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view notification logs for assigned jobs"
  ON public.customer_notification_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM job_assignments ja
    WHERE ja.job_id = customer_notification_log.job_id AND ja.engineer_id = auth.uid()
  ));
