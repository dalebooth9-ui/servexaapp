-- ── Asset register auto-sync from dry riser job sheets ─────────────
-- Adds riser-specific columns to public.assets, a per-visit history table,
-- and a review-flag table for meaningful mismatches (e.g. outlet count changed).
-- A trigger on job_sheet_responses fires on submission for dry-riser templates
-- and upserts the site's dry riser asset from the response payload.

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS asset_type text,
  ADD COLUMN IF NOT EXISTS riser_location text,
  ADD COLUMN IF NOT EXISTS outlets_count integer,
  ADD COLUMN IF NOT EXISTS last_inspection_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_inspection_type text,
  ADD COLUMN IF NOT EXISTS last_inspection_result text,
  ADD COLUMN IF NOT EXISTS last_job_id uuid,
  ADD COLUMN IF NOT EXISTS last_job_sheet_response_id uuid,
  ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS assets_site_type_location_idx
  ON public.assets (site_id, asset_type, lower(coalesce(riser_location, '')));

-- Per-visit service history: every submitted sheet linked to an asset.
CREATE TABLE IF NOT EXISTS public.asset_service_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  job_id uuid,
  job_sheet_response_id uuid,
  template_id uuid,
  template_name text,
  inspection_type text,
  inspection_date timestamptz,
  result_summary text,
  outlets_count integer,
  riser_location text,
  org_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, job_sheet_response_id)
);
GRANT SELECT ON public.asset_service_history TO authenticated;
GRANT ALL ON public.asset_service_history TO service_role;
ALTER TABLE public.asset_service_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read asset history"
  ON public.asset_service_history FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS asset_service_history_asset_idx
  ON public.asset_service_history (asset_id, inspection_date DESC);

-- Review flags: raised when a resubmission disagrees with existing asset data.
CREATE TABLE IF NOT EXISTS public.asset_review_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  job_id uuid,
  job_sheet_response_id uuid,
  field text NOT NULL,
  old_value text,
  new_value text,
  reason text,
  status text NOT NULL DEFAULT 'open',
  org_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);
GRANT SELECT, UPDATE ON public.asset_review_flags TO authenticated;
GRANT ALL ON public.asset_review_flags TO service_role;
ALTER TABLE public.asset_review_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read asset review flags"
  ON public.asset_review_flags FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth resolve asset review flags"
  ON public.asset_review_flags FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS asset_review_flags_open_idx
  ON public.asset_review_flags (status, created_at DESC);

-- Helper: coerce a JSONB value that might be a number, string like "2", or
-- string like "NO OF OUTLETS: 2" / "2 outlets" into an integer.
CREATE OR REPLACE FUNCTION public._extract_int_from_jsonb(v jsonb)
RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  s text;
  m text;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN RETURN NULL; END IF;
  IF jsonb_typeof(v) = 'number' THEN RETURN (v::text)::numeric::int; END IF;
  s := v #>> '{}';
  IF s IS NULL OR btrim(s) = '' THEN RETURN NULL; END IF;
  m := (regexp_matches(s, '(\d+)'))[1];
  IF m IS NULL THEN RETURN NULL; END IF;
  RETURN m::int;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;

-- Core sync routine — called from the AFTER trigger on job_sheet_responses.
CREATE OR REPLACE FUNCTION public.sync_asset_from_job_sheet(_response_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  tpl record;
  j record;
  is_dry_riser boolean;
  insp_type text;
  insp_date timestamptz;
  outlets int;
  riser_loc text;
  result_summary text;
  asset_id uuid;
  existing record;
  answers jsonb;
  key text;
BEGIN
  SELECT * INTO r FROM public.job_sheet_responses WHERE id = _response_id;
  IF NOT FOUND OR r.status <> 'submitted' THEN RETURN; END IF;

  SELECT id, name, category, job_category
    INTO tpl FROM public.job_sheet_templates WHERE id = r.template_id;
  IF NOT FOUND THEN RETURN; END IF;

  is_dry_riser :=
    coalesce(tpl.job_category ILIKE 'dry_riser%', false)
    OR coalesce(tpl.name ILIKE '%dry riser%', false);
  IF NOT is_dry_riser THEN RETURN; END IF;

  SELECT id, site_id, org_id, category, completed_at
    INTO j FROM public.jobs WHERE id = r.job_id;
  IF NOT FOUND OR j.site_id IS NULL THEN RETURN; END IF;

  answers := coalesce(r.responses, '{}'::jsonb);

  -- Inspection type from template category
  insp_type := CASE
    WHEN tpl.job_category ILIKE '%pressure%' OR tpl.category = 'pressure_test' THEN 'pressure_test'
    WHEN tpl.job_category ILIKE '%visual%'   OR tpl.category = 'visual'         THEN 'visual'
    WHEN tpl.job_category ILIKE '%install%'  OR tpl.job_category ILIKE '%commission%' THEN 'commissioning'
    WHEN tpl.job_category ILIKE '%remedial%' OR tpl.job_category ILIKE '%repair%'     THEN 'remedial'
    ELSE coalesce(tpl.category, tpl.job_category, 'inspection')
  END;

  insp_date := coalesce(r.submitted_at, j.completed_at, now());

  -- Outlets count: try common keys, then any key containing "outlet"/"landing"
  outlets := public._extract_int_from_jsonb(answers -> 'number_of_outlets');
  IF outlets IS NULL THEN outlets := public._extract_int_from_jsonb(answers -> 'no_of_outlets'); END IF;
  IF outlets IS NULL THEN outlets := public._extract_int_from_jsonb(answers -> 'outlets'); END IF;
  IF outlets IS NULL THEN outlets := public._extract_int_from_jsonb(answers -> 'landing_valves'); END IF;
  IF outlets IS NULL THEN outlets := public._extract_int_from_jsonb(answers -> 'number_of_landing_valves'); END IF;
  IF outlets IS NULL THEN
    FOR key IN SELECT k FROM jsonb_object_keys(answers) k LOOP
      IF key ILIKE '%outlet%' OR key ILIKE '%landing%valve%' THEN
        outlets := public._extract_int_from_jsonb(answers -> key);
        EXIT WHEN outlets IS NOT NULL;
      END IF;
    END LOOP;
  END IF;

  riser_loc := coalesce(
    nullif(btrim(answers ->> 'riser_location'), ''),
    nullif(btrim(answers ->> 'location'), ''),
    nullif(btrim(answers ->> 'riser_position'), '')
  );

  result_summary := coalesce(
    nullif(btrim(answers ->> 'overall_result'), ''),
    nullif(btrim(answers ->> 'result'), ''),
    nullif(btrim(answers ->> 'pass_fail'), ''),
    nullif(btrim(answers ->> 'test_result'), '')
  );

  -- Locate existing dry riser asset for this site + location.
  SELECT id, outlets_count, riser_location
    INTO existing
    FROM public.assets
   WHERE site_id = j.site_id
     AND coalesce(asset_type, category) ILIKE 'dry%riser%'
     AND (
       riser_loc IS NULL
       OR lower(coalesce(riser_location, '')) = lower(coalesce(riser_loc, ''))
       OR riser_location IS NULL
     )
   ORDER BY (riser_location IS NOT NULL) DESC, updated_at DESC NULLS LAST
   LIMIT 1;

  IF existing.id IS NULL THEN
    INSERT INTO public.assets (
      name, category, asset_type, site_id, org_id, status,
      riser_location, outlets_count,
      last_inspection_at, last_inspection_type, last_inspection_result,
      last_job_id, last_job_sheet_response_id, attributes
    ) VALUES (
      concat('Dry Riser', CASE WHEN riser_loc IS NOT NULL THEN ' — ' || riser_loc ELSE '' END),
      'Dry Riser', 'Dry Riser', j.site_id, j.org_id, 'active',
      riser_loc, outlets,
      insp_date, insp_type, result_summary,
      j.id, r.id,
      jsonb_build_object('auto_created_from_response', r.id)
    ) RETURNING id INTO asset_id;
  ELSE
    asset_id := existing.id;

    -- Flag: outlet count disagreement (never silently overwrite)
    IF outlets IS NOT NULL AND existing.outlets_count IS NOT NULL
       AND outlets <> existing.outlets_count THEN
      INSERT INTO public.asset_review_flags (
        asset_id, job_id, job_sheet_response_id, field,
        old_value, new_value, reason, org_id
      ) VALUES (
        asset_id, j.id, r.id, 'outlets_count',
        existing.outlets_count::text, outlets::text,
        'Outlet count on new sheet differs from previous asset record — please verify site data.',
        j.org_id
      );
    END IF;

    UPDATE public.assets
       SET riser_location = coalesce(riser_loc, riser_location),
           -- Only overwrite outlets_count when the new value matches or the
           -- existing value is null; otherwise leave it and rely on the flag.
           outlets_count = CASE
             WHEN outlets IS NULL THEN outlets_count
             WHEN outlets_count IS NULL THEN outlets
             WHEN outlets = outlets_count THEN outlets
             ELSE outlets_count
           END,
           last_inspection_at = insp_date,
           last_inspection_type = insp_type,
           last_inspection_result = coalesce(result_summary, last_inspection_result),
           last_job_id = j.id,
           last_job_sheet_response_id = r.id,
           asset_type = coalesce(asset_type, 'Dry Riser'),
           updated_at = now()
     WHERE id = asset_id;
  END IF;

  -- Always log the visit in the asset's history.
  INSERT INTO public.asset_service_history (
    asset_id, job_id, job_sheet_response_id, template_id, template_name,
    inspection_type, inspection_date, result_summary,
    outlets_count, riser_location, org_id
  ) VALUES (
    asset_id, j.id, r.id, tpl.id, tpl.name,
    insp_type, insp_date, result_summary,
    outlets, riser_loc, j.org_id
  )
  ON CONFLICT (asset_id, job_sheet_response_id) DO NOTHING;
END $$;

-- Trigger wrapper (SECURITY DEFINER function does the work).
CREATE OR REPLACE FUNCTION public.tg_sync_asset_from_job_sheet()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'submitted'
     AND (TG_OP = 'INSERT' OR coalesce(OLD.status, '') IS DISTINCT FROM 'submitted') THEN
    PERFORM public.sync_asset_from_job_sheet(NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block submission on asset-sync failures; just log.
  RAISE WARNING 'sync_asset_from_job_sheet failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_asset_from_job_sheet ON public.job_sheet_responses;
CREATE TRIGGER trg_sync_asset_from_job_sheet
AFTER INSERT OR UPDATE OF status ON public.job_sheet_responses
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_asset_from_job_sheet();