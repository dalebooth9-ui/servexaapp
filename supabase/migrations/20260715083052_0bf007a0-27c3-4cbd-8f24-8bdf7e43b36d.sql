
ALTER TABLE public.email_branding
  ADD COLUMN IF NOT EXISTS strapline text,
  ADD COLUMN IF NOT EXISTS accreditation_logo_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sign_off_text text NOT NULL DEFAULT 'Kind regards,';

-- Prefill Viva Fire org row(s) with real signature content (idempotent — only sets when currently blank/default).
UPDATE public.email_branding
SET
  company_name    = COALESCE(NULLIF(company_name,''), 'Viva Fire Protection Ltd'),
  from_name       = COALESCE(NULLIF(from_name,''),    'Viva Fire Protection'),
  from_address    = COALESCE(NULLIF(from_address,''), 'service@vivafire.co.uk'),
  reply_to        = COALESCE(NULLIF(reply_to,''),     'service@vivafire.co.uk'),
  phone           = COALESCE(phone,   '0845 269 8482'),
  website         = COALESCE(website, 'https://www.vivafire.co.uk'),
  address         = COALESCE(address, 'Unit 1 Lady Road, St Johns Industrial Estate, Lees, Oldham, OL4 3DZ'),
  strapline       = COALESCE(strapline, 'Wet & Dry Riser Specialists'),
  sign_off_text   = COALESCE(NULLIF(sign_off_text,''), 'Kind regards,'),
  brand_color     = COALESCE(NULLIF(brand_color,''),  '#1e40af')
WHERE from_address ILIKE '%vivafire%'
   OR company_name ILIKE '%viva fire%'
   OR org_id IN (
        'd72be0ed-7bd6-42bb-9fa3-0701fbe3d68c',
        '11111111-1111-1111-1111-111111111111'
      );
