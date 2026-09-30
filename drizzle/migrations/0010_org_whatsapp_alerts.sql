ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS office_whatsapp_number text,
  ADD COLUMN IF NOT EXISTS whatsapp_alerts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_template_sid text;

COMMENT ON COLUMN public.organisations.office_whatsapp_number IS 'E.164 WhatsApp number for office alerts';
COMMENT ON COLUMN public.organisations.whatsapp_template_sid IS 'Approved Twilio Content template SID used for out-of-window office alerts';