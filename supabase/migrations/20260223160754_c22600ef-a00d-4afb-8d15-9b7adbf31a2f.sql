-- App settings key-value store for configurable features
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all settings"
  ON public.app_settings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view settings"
  ON public.app_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Seed the follow-up reminder config
INSERT INTO public.app_settings (key, value) VALUES (
  'followup_reminder',
  '{
    "enabled": true,
    "email_subject": "Upcoming {{service_type}} – {{reference}}",
    "email_body": "Dear {{customer_name}},\n\nThis is a courtesy reminder that a {{service_type_lower}} service is due at your premises.\n\nService Type: {{service_type}}\nReference: {{reference}}\nScheduled Date: {{scheduled_date}}\n{{#address}}Location: {{address}}{{/address}}\n\nPlease could you confirm access arrangements for our engineer to attend on or around this date. If this date is not suitable, please let us know and we can arrange an alternative.\n\nIf you have any questions, please don''t hesitate to get in touch.\n\nKind regards,\nViva Fire & Protection"
  }'::jsonb
);