UPDATE public.app_settings
SET value = jsonb_set(
  value,
  '{email_body}',
  to_jsonb('Dear {{customer_name}},

This is a courtesy reminder that a {{service_type_lower}} service is due at your premises.

Service Type: {{service_type}}
Reference: {{reference}}
Scheduled Date: {{scheduled_date}}
{{#address}}Location: {{address}}{{/address}}

Please could you confirm access arrangements for our engineer to attend on or around this date. If this date is not suitable, please let us know and we can arrange an alternative.

Any questions, just give us a call or drop us an email.

Kind regards,
Viva Fire & Protection'::text)
)
WHERE key = 'followup_reminder';