
CREATE TABLE IF NOT EXISTS public.email_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  from_name text NOT NULL DEFAULT 'Viva Fire Protection',
  from_address text NOT NULL DEFAULT 'service@vivafire.co.uk',
  reply_to text NOT NULL DEFAULT 'service@vivafire.co.uk',
  logo_url text,
  brand_color text NOT NULL DEFAULT '#1e40af',
  company_name text NOT NULL DEFAULT 'Viva Fire Protection Ltd',
  phone text,
  website text,
  address text,
  signature_html text,
  footer_note text DEFAULT 'This is an automated email from Viva Fire Protection. Reply to this message to contact us directly.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_branding TO authenticated;
GRANT ALL ON public.email_branding TO service_role;

ALTER TABLE public.email_branding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read email_branding in org" ON public.email_branding;
CREATE POLICY "Members read email_branding in org"
  ON public.email_branding FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Admins manage email_branding in org" ON public.email_branding;
CREATE POLICY "Admins manage email_branding in org"
  ON public.email_branding FOR ALL
  TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_email_branding_org_id ON public.email_branding;
CREATE TRIGGER trg_email_branding_org_id
  BEFORE INSERT ON public.email_branding
  FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();

CREATE OR REPLACE FUNCTION public.email_branding_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_branding_touch_updated_at ON public.email_branding;
CREATE TRIGGER trg_email_branding_touch_updated_at
  BEFORE UPDATE ON public.email_branding
  FOR EACH ROW EXECUTE FUNCTION public.email_branding_touch_updated_at();

INSERT INTO public.email_branding (org_id)
SELECT id FROM public.organisations
ON CONFLICT (org_id) DO NOTHING;

UPDATE public.email_branding
   SET from_name = 'Viva Fire Protection',
       from_address = 'service@vivafire.co.uk',
       reply_to = 'service@vivafire.co.uk',
       brand_color = '#1e40af',
       company_name = 'Viva Fire Protection Ltd',
       website = COALESCE(website, 'https://www.vivafire.co.uk')
 WHERE org_id = '11111111-1111-1111-1111-111111111111'::uuid;
