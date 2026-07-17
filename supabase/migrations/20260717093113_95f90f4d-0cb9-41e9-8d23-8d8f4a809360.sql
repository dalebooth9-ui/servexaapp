
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS scan_intake_email text UNIQUE;

CREATE OR REPLACE FUNCTION public.generate_scan_intake_email(_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_slug text := regexp_replace(lower(coalesce(_slug, 'org')), '[^a-z0-9-]+', '-', 'g');
  candidate text;
  rand_suffix text;
BEGIN
  base_slug := regexp_replace(base_slug, '(^-+|-+$)', '', 'g');
  IF length(base_slug) = 0 THEN base_slug := 'org'; END IF;
  IF length(base_slug) > 30 THEN base_slug := substr(base_slug, 1, 30); END IF;
  LOOP
    rand_suffix := substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
    candidate := 'scans-' || base_slug || '-' || rand_suffix || '@intake.servexaapp.com';
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.organisations
      WHERE scan_intake_email = candidate OR intake_email = candidate
    );
  END LOOP;
  RETURN candidate;
END $$;

REVOKE ALL ON FUNCTION public.generate_scan_intake_email(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_scan_intake_email(text) TO service_role;

UPDATE public.organisations
   SET scan_intake_email = public.generate_scan_intake_email(slug)
 WHERE scan_intake_email IS NULL;

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
  IF NEW.scan_intake_email IS NULL OR NEW.scan_intake_email = '' THEN
    NEW.scan_intake_email := public.generate_scan_intake_email(NEW.slug);
  END IF;
  RETURN NEW;
END $$;

DROP FUNCTION IF EXISTS public.resolve_org_by_intake_email(text);
CREATE OR REPLACE FUNCTION public.resolve_org_by_intake_email(_email text)
RETURNS TABLE(org_id uuid, allowed boolean, status text, kind text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid; v_status text; v_kind text;
  v_email text := lower(trim(_email));
  v_count int;
  v_limit constant int := 30;
  v_window_seconds constant int := 3600;
BEGIN
  SELECT id, status, 'po' INTO v_org_id, v_status, v_kind
    FROM public.organisations WHERE lower(intake_email) = v_email LIMIT 1;

  IF v_org_id IS NULL THEN
    SELECT id, status, 'scan' INTO v_org_id, v_status, v_kind
      FROM public.organisations WHERE lower(scan_intake_email) = v_email LIMIT 1;
  END IF;

  IF v_org_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, false, NULL::text, NULL::text; RETURN;
  END IF;
  IF v_status <> 'active' THEN
    RETURN QUERY SELECT v_org_id, false, v_status, v_kind; RETURN;
  END IF;

  INSERT INTO public.po_intake_rate_limit(intake_email, window_start, count, updated_at)
  VALUES (v_email, now(), 1, now())
  ON CONFLICT (intake_email) DO UPDATE
    SET count = CASE WHEN po_intake_rate_limit.window_start < now() - make_interval(secs => v_window_seconds) THEN 1
                     ELSE po_intake_rate_limit.count + 1 END,
        window_start = CASE WHEN po_intake_rate_limit.window_start < now() - make_interval(secs => v_window_seconds) THEN now()
                            ELSE po_intake_rate_limit.window_start END,
        updated_at = now()
  RETURNING count INTO v_count;

  RETURN QUERY SELECT v_org_id, (v_count <= v_limit), v_status, v_kind;
END $$;

REVOKE ALL ON FUNCTION public.resolve_org_by_intake_email(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_org_by_intake_email(text) TO service_role;
