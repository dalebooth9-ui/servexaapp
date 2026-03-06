
CREATE TABLE public.engineer_onboarding_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engineer_user_id uuid NOT NULL,
  sent_to_email text NOT NULL,
  sent_by uuid NOT NULL,
  sent_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.engineer_onboarding_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage onboarding logs"
  ON public.engineer_onboarding_logs
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
