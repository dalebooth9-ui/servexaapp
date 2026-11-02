CREATE OR REPLACE FUNCTION public.sync_asset_from_job_sheet(_response_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  r record; tpl record; j record;
  is_dry_riser boolean; insp_type text; insp_date timestamptz;
  outlets int; riser_loc text; result_summary text;
  v_asset_id uuid; picked_id uuid; existing record; answers jsonb; key text; is_newer boolean;
BEGIN
  SELECT * INTO r FROM public.job_sheet_responses WHERE id = _response_id;
  IF NOT FOUND OR r.status <> 'submitted' THEN RETURN; END IF;

  SELECT id, name, category, job_category INTO tpl FROM public.job_sheet_templates WHERE id = r.template_id;
  IF NOT FOUND THEN RETURN; END IF;

  is_dry_riser := coalesce(tpl.job_category ILIKE 'dry_riser%', false) OR coalesce(tpl.name ILIKE '%dry riser%', false);
  IF NOT is_dry_riser THEN RETURN; END IF;

  SELECT id, site_id, org_id, category, completed_at INTO j FROM public.jobs WHERE id = r.job_id;
  IF NOT FOUND OR j.site_id IS NULL THEN RETURN; END IF;

  answers := coalesce(r.responses, '{}'::jsonb);

  insp_type := CASE
    WHEN tpl.job_category ILIKE '%pressure%' OR tpl.category = 'pressure_test' THEN 'pressure_test'
    WHEN tpl.job_category ILIKE '%visual%'   OR tpl.category = 'visual'         THEN 'visual'
    WHEN tpl.job_category ILIKE '%install%'  OR tpl.job_category ILIKE '%commission%' THEN 'commissioning'
    WHEN tpl.job_category ILIKE '%remedial%' OR tpl.job_category ILIKE '%repair%'     THEN 'remedial'
    ELSE coalesce(tpl.category, tpl.job_category, 'inspection')
  END;
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
    nullif(btrim(answers ->> 'riser_position'), ''));

  result_summary := coalesce(
    nullif(btrim(answers ->> 'overall_result'), ''),
    nullif(btrim(answers ->> 'result'), ''),
    nullif(btrim(answers ->> 'pass_fail'), ''),
    nullif(btrim(answers ->> 'test_result'), ''));

  SELECT NULL::uuid AS id, NULL::int AS outlets_count, NULL::text AS riser_location, NULL::timestamptz AS last_inspection_at INTO existing;

  -- 1. Asset chosen on the sheet
  BEGIN
    picked_id := nullif(btrim(answers ->> 'riser_asset_id'), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN picked_id := NULL;
  END;
  IF picked_id IS NOT NULL THEN
    SELECT id, outlets_count, riser_location, last_inspection_at INTO existing
      FROM public.assets WHERE id = picked_id AND org_id = j.org_id AND site_id = j.site_id;
  END IF;

  -- 2. No location and no chosen asset: never guess, flag instead
  IF existing.id IS NULL AND riser_loc IS NULL THEN
    INSERT INTO public.asset_review_flags (asset_id, site_id, job_id, job_sheet_response_id, field, old_value, new_value, reason, org_id)
    SELECT NULL, j.site_id, j.id, r.id, 'riser_location_missing', NULL, NULL,
           'Dry riser sheet submitted without a riser location — link it to the right riser.', j.org_id
    WHERE NOT EXISTS (SELECT 1 FROM public.asset_review_flags f WHERE f.job_sheet_response_id = r.id AND f.field = 'riser_location_missing');
    INSERT INTO public.asset_service_history (asset_id, site_id, job_id, job_sheet_response_id, template_id, template_name,
      inspection_type, inspection_date, result_summary, outlets_count, riser_location, org_id)
    SELECT NULL, j.site_id, j.id, r.id, tpl.id, tpl.name, insp_type, insp_date, result_summary, outlets, NULL, j.org_id
    WHERE NOT EXISTS (SELECT 1 FROM public.asset_service_history h WHERE h.job_sheet_response_id = r.id);
    RETURN;
  END IF;

  -- 3. Fallback: same site + exact riser location
  IF existing.id IS NULL THEN
    SELECT id, outlets_count, riser_location, last_inspection_at INTO existing
      FROM public.assets
     WHERE site_id = j.site_id AND org_id = j.org_id
       AND coalesce(asset_type, category) ILIKE 'dry%riser%'
       AND lower(btrim(coalesce(riser_location, ''))) = lower(riser_loc)
     ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  END IF;

  IF existing.id IS NULL THEN
    INSERT INTO public.assets (name, category, asset_type, site_id, org_id, status, riser_location, outlets_count,
      last_inspection_at, last_inspection_type, last_inspection_result, last_job_id, last_job_sheet_response_id, attributes)
    VALUES (concat('Dry Riser — ', riser_loc), 'Dry Riser', 'Dry Riser', j.site_id, j.org_id, 'operational',
      riser_loc, outlets, insp_date, insp_type, result_summary, j.id, r.id,
      jsonb_build_object('auto_created_from_response', r.id))
    RETURNING id INTO v_asset_id;
  ELSE
    v_asset_id := existing.id;
    IF outlets IS NOT NULL AND existing.outlets_count IS NOT NULL AND outlets <> existing.outlets_count THEN
      INSERT INTO public.asset_review_flags (asset_id, site_id, job_id, job_sheet_response_id, field, old_value, new_value, reason, org_id)
      VALUES (v_asset_id, j.site_id, j.id, r.id, 'outlets_count', existing.outlets_count::text, outlets::text,
        'Outlet count on new sheet differs from previous asset record — please verify site data.', j.org_id);
    END IF;
    is_newer := existing.last_inspection_at IS NULL OR insp_date >= existing.last_inspection_at;
    UPDATE public.assets SET
      riser_location = coalesce(riser_location, riser_loc),
      outlets_count = CASE WHEN outlets IS NULL THEN outlets_count WHEN outlets_count IS NULL THEN outlets ELSE outlets_count END,
      last_inspection_at = CASE WHEN is_newer THEN insp_date ELSE last_inspection_at END,
      last_inspection_type = CASE WHEN is_newer THEN insp_type ELSE last_inspection_type END,
      last_inspection_result = CASE WHEN is_newer THEN coalesce(result_summary, last_inspection_result) ELSE last_inspection_result END,
      last_job_id = CASE WHEN is_newer THEN j.id ELSE last_job_id END,
      last_job_sheet_response_id = CASE WHEN is_newer THEN r.id ELSE last_job_sheet_response_id END,
      asset_type = coalesce(asset_type, 'Dry Riser'),
      updated_at = now()
    WHERE id = v_asset_id;
  END IF;

  INSERT INTO public.asset_service_history (asset_id, site_id, job_id, job_sheet_response_id, template_id, template_name,
    inspection_type, inspection_date, result_summary, outlets_count, riser_location, org_id)
  VALUES (v_asset_id, j.site_id, j.id, r.id, tpl.id, tpl.name, insp_type, insp_date, result_summary, outlets, riser_loc, j.org_id)
  ON CONFLICT (asset_id, job_sheet_response_id) DO NOTHING;
END $function$;