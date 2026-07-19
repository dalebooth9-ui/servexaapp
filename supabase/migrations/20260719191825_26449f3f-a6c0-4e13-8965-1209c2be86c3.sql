-- Purge Viva-branded email_branding row that had leaked into a non-Viva
-- organisation. The new getEmailBranding() helper will return a neutral
-- default (org's own name, notify.servexaapp.com fallback address) so no
-- outbound customer email impersonates Viva Fire.
DELETE FROM public.email_branding
WHERE org_id <> '11111111-1111-1111-1111-111111111111'
  AND (
    from_address ILIKE '%vivafire%'
    OR reply_to    ILIKE '%vivafire%'
    OR company_name ILIKE '%viva fire%'
    OR from_name    ILIKE '%viva fire%'
  );