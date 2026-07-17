
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS historic_backfill boolean NOT NULL DEFAULT false;

ALTER TABLE public.paper_scan_batch_items
  ADD COLUMN IF NOT EXISTS matched_existing_job boolean NOT NULL DEFAULT false;

-- Replace sync routine: prefer the historic completion date, and never
-- regress the asset's last_inspection_at when older sheets arrive out of order.
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
  is_newer boolean;
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

  insp_type := CASE
    WHEN tpl.job_category ILIKE '%pressure%' OR tpl.category = 'pressure_test' THEN 'pressure_test'
    WHEN tpl.job_category ILIKE '%visual%'   OR tpl.category = 'visual'         THEN 'visual'
    WHEN tpl.job_category ILIKE '%install%'  OR tpl.job_category ILIKE '%commission%' THEN 'commissioning'
    WHEN tpl.job_category ILIKE '%remedial%' OR tpl.job_category ILIKE '%repair%'     THEN 'remedial'
    ELSE coalesce(tpl.category, tpl.job_category, 'inspection')
  END;

  -- Prefer the job's completed_at (set to the handwritten date during
  -- backlog imports) over the row's submitted_at (which is "now" for backfills).
  insp_date := coalesce(j.completed_at, r.submitted_at, now());

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

  SELECT id, outlets_count, riser_location, last_inspection_at
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

    -- Backlog-safe: keep the newest inspection date. Older sheets still get
    -- logged to asset_service_history below, but don't regress the asset row.
    is_newer := existing.last_inspection_at IS NULL
                OR insp_date >= existing.last_inspection_at;

    UPDATE public.assets
       SET riser_location = coalesce(riser_loc, riser_location),
           outlets_count = CASE
             WHEN outlets IS NULL THEN outlets_count
             WHEN outlets_count IS NULL THEN outlets
             WHEN outlets = outlets_count THEN outlets
             ELSE outlets_count
           END,
           last_inspection_at = CASE WHEN is_newer THEN insp_date ELSE last_inspection_at END,
           last_inspection_type = CASE WHEN is_newer THEN insp_type ELSE last_inspection_type END,
           last_inspection_result = CASE WHEN is_newer THEN coalesce(result_summary, last_inspection_result) ELSE last_inspection_result END,
           last_job_id = CASE WHEN is_newer THEN j.id ELSE last_job_id END,
           last_job_sheet_response_id = CASE WHEN is_newer THEN r.id ELSE last_job_sheet_response_id END,
           asset_type = coalesce(asset_type, 'Dry Riser'),
           updated_at = now()
     WHERE id = asset_id;
  END IF;

  -- Always log the visit in the asset's history (chronological, dedup'd on
  -- job_sheet_response_id).
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
