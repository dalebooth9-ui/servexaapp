
-- 1. intake_email column on organisations
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS intake_email text UNIQUE;

-- Deterministic pseudo-random 4-char suffix generator (avoid ambiguous chars)
CREATE OR REPLACE FUNCTION public.generate_intake_email(_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars text := 'abcdefghjkmnpqrstuvwxyz23456789';
  suffix text;
  candidate text;
  clean_slug text;
  attempts int := 0;
BEGIN
  clean_slug := regexp_replace(lower(coalesce(_slug, 'org')), '[^a-z0-9]+', '-', 'g');
  clean_slug := trim(both '-' from clean_slug);
  IF clean_slug = '' THEN clean_slug := 'org'; END IF;
  IF length(clean_slug) > 30 THEN clean_slug := left(clean_slug, 30); END IF;

  LOOP
    suffix := '';
    FOR i IN 1..4 LOOP
      suffix := suffix || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    candidate := 'po-' || clean_slug || '-' || suffix || '@intake.servexaapp.com';
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.organisations WHERE intake_email = candidate);
    attempts := attempts + 1;
    IF attempts > 20 THEN
      RAISE EXCEPTION 'Could not generate unique intake email';
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$;

-- Backfill existing organisations
UPDATE public.organisations
   SET intake_email = public.generate_intake_email(slug)
 WHERE intake_email IS NULL;

-- Trigger to auto-assign on insert
CREATE OR REPLACE FUNCTION public.assign_intake_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.intake_email IS NULL OR NEW.intake_email = '' THEN
    NEW.intake_email := public.generate_intake_email(NEW.slug);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_intake_email_before_insert ON public.organisations;
CREATE TRIGGER assign_intake_email_before_insert
BEFORE INSERT ON public.organisations
FOR EACH ROW EXECUTE FUNCTION public.assign_intake_email();

-- 2. Rate-limit table
CREATE TABLE IF NOT EXISTS public.po_intake_rate_limit (
  intake_email text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.po_intake_rate_limit TO authenticated;
GRANT ALL ON public.po_intake_rate_limit TO service_role;

ALTER TABLE public.po_intake_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read rate limits"
  ON public.po_intake_rate_limit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Resolver + rate-limiter (service role only)
CREATE OR REPLACE FUNCTION public.resolve_org_by_intake_email(_email text)
RETURNS TABLE(org_id uuid, allowed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_email text := lower(trim(_email));
  v_count int;
  v_window timestamptz;
  v_limit constant int := 30;
  v_window_seconds constant int := 3600;
BEGIN
  SELECT id INTO v_org_id FROM public.organisations WHERE lower(intake_email) = v_email LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, false;
    RETURN;
  END IF;

  INSERT INTO public.po_intake_rate_limit(intake_email, window_start, count, updated_at)
  VALUES (v_email, now(), 1, now())
  ON CONFLICT (intake_email) DO UPDATE
    SET count = CASE
                  WHEN po_intake_rate_limit.window_start < now() - make_interval(secs => v_window_seconds) THEN 1
                  ELSE po_intake_rate_limit.count + 1
                END,
        window_start = CASE
                         WHEN po_intake_rate_limit.window_start < now() - make_interval(secs => v_window_seconds) THEN now()
                         ELSE po_intake_rate_limit.window_start
                       END,
        updated_at = now()
  RETURNING count, window_start INTO v_count, v_window;

  RETURN QUERY SELECT v_org_id, (v_count <= v_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_org_by_intake_email(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_org_by_intake_email(text) TO service_role;
