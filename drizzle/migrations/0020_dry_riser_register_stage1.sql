-- Review flags can exist before an asset exists (sync errors, missing riser location)
ALTER TABLE public.asset_review_flags ALTER COLUMN asset_id DROP NOT NULL;
ALTER TABLE public.asset_review_flags ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS asset_review_flags_open_idx ON public.asset_review_flags (org_id, status);

-- Site-level history + imported report fields
ALTER TABLE public.asset_service_history ALTER COLUMN asset_id DROP NOT NULL;
ALTER TABLE public.asset_service_history
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS report_file text,
  ADD COLUMN IF NOT EXISTS report_link text,
  ADD COLUMN IF NOT EXISTS report_date_text text;
UPDATE public.asset_service_history h SET site_id = a.site_id FROM public.assets a WHERE a.id = h.asset_id AND h.site_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS asset_service_history_site_report_file_key
  ON public.asset_service_history (site_id, report_file) WHERE report_file IS NOT NULL;
CREATE INDEX IF NOT EXISTS asset_service_history_site_idx ON public.asset_service_history (site_id, inspection_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_service_history TO authenticated;
GRANT ALL ON public.asset_service_history TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.asset_review_flags TO authenticated;
GRANT ALL ON public.asset_review_flags TO service_role;

CREATE POLICY "Org admins insert asset service history" ON public.asset_service_history FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "Org admins update asset service history" ON public.asset_service_history FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "Org admins delete asset service history" ON public.asset_service_history FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "Org admins insert asset review flags" ON public.asset_review_flags FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

-- 6-character asset tags
CREATE OR REPLACE FUNCTION public.generate_asset_tag()
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  t text; i int; attempt int := 0;
BEGIN
  LOOP
    t := '';
    FOR i IN 1..6 LOOP
      t := t || substr(chars, 1 + floor(random() * 32)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.assets WHERE asset_tag = t);
    attempt := attempt + 1;
    IF attempt > 50 THEN RAISE EXCEPTION 'Could not generate unique asset tag'; END IF;
  END LOOP;
  RETURN t;
END $$;

CREATE OR REPLACE FUNCTION public.tg_assign_asset_tag()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.asset_tag IS NULL OR btrim(NEW.asset_tag) = '' THEN
    NEW.asset_tag := public.generate_asset_tag();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS assign_asset_tag ON public.assets;
CREATE TRIGGER assign_asset_tag BEFORE INSERT ON public.assets FOR EACH ROW EXECUTE FUNCTION public.tg_assign_asset_tag();

-- Sync: operational status, chosen asset first, exact site+location fallback, no arbitrary attach
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

CREATE OR REPLACE FUNCTION public.tg_sync_asset_from_job_sheet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_err text; v_job record;
BEGIN
  IF NEW.status = 'submitted'
     AND (TG_OP = 'INSERT' OR coalesce(OLD.status, '') IS DISTINCT FROM 'submitted') THEN
    BEGIN
      PERFORM public.sync_asset_from_job_sheet(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      BEGIN
        SELECT id, site_id, org_id INTO v_job FROM public.jobs WHERE id = NEW.job_id;
        INSERT INTO public.asset_review_flags (asset_id, site_id, job_id, job_sheet_response_id, field, old_value, new_value, reason, org_id)
        VALUES (NULL, v_job.site_id, NEW.job_id, NEW.id, 'sync_error', NULL, left(v_err, 500),
          'Asset register could not be updated from this report.', coalesce(v_job.org_id, NEW.org_id));
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'asset sync flag failed for %: %', NEW.id, SQLERRM;
      END;
    END;
  END IF;
  RETURN NEW;
END $function$;

-- Move a riser to another site
CREATE OR REPLACE FUNCTION public.move_asset_site(_asset_id uuid, _site_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.get_user_org_id();
BEGIN
  IF NOT public.has_role_in_org(auth.uid(), v_org, 'admin'::app_role) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.assets WHERE id = _asset_id AND org_id = v_org) THEN RAISE EXCEPTION 'Asset not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = _site_id AND org_id = v_org) THEN RAISE EXCEPTION 'Site not found'; END IF;
  UPDATE public.assets SET site_id = _site_id, updated_at = now() WHERE id = _asset_id;
  UPDATE public.asset_service_history SET site_id = _site_id WHERE asset_id = _asset_id;
  UPDATE public.defects SET site_id = _site_id WHERE asset_id = _asset_id;
END $$;

-- Merge duplicate risers: history, defects, flags move to the kept one; the other is decommissioned
CREATE OR REPLACE FUNCTION public.merge_assets(_keep_id uuid, _remove_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.get_user_org_id(); k record; rm record;
BEGIN
  IF _keep_id = _remove_id THEN RAISE EXCEPTION 'Pick two different assets'; END IF;
  IF NOT public.has_role_in_org(auth.uid(), v_org, 'admin'::app_role) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO k FROM public.assets WHERE id = _keep_id AND org_id = v_org;
  SELECT * INTO rm FROM public.assets WHERE id = _remove_id AND org_id = v_org;
  IF k.id IS NULL OR rm.id IS NULL THEN RAISE EXCEPTION 'Asset not found'; END IF;
  -- drop history rows that would collide on (asset_id, response)
  DELETE FROM public.asset_service_history h WHERE h.asset_id = _remove_id AND h.job_sheet_response_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.asset_service_history x WHERE x.asset_id = _keep_id AND x.job_sheet_response_id = h.job_sheet_response_id);
  UPDATE public.asset_service_history SET asset_id = _keep_id, site_id = k.site_id WHERE asset_id = _remove_id;
  UPDATE public.defects SET asset_id = _keep_id WHERE asset_id = _remove_id;
  UPDATE public.asset_review_flags SET asset_id = _keep_id WHERE asset_id = _remove_id;
  UPDATE public.assets SET
    riser_location = coalesce(riser_location, rm.riser_location),
    outlets_count = coalesce(outlets_count, rm.outlets_count),
    last_inspection_at = CASE WHEN rm.last_inspection_at > coalesce(last_inspection_at, '-infinity') THEN rm.last_inspection_at ELSE last_inspection_at END,
    last_inspection_type = CASE WHEN rm.last_inspection_at > coalesce(last_inspection_at, '-infinity') THEN rm.last_inspection_type ELSE last_inspection_type END,
    last_inspection_result = CASE WHEN rm.last_inspection_at > coalesce(last_inspection_at, '-infinity') THEN rm.last_inspection_result ELSE last_inspection_result END,
    updated_at = now()
  WHERE id = _keep_id;
  UPDATE public.assets SET status = 'decommissioned',
    notes = concat_ws(E'\n', notes, 'Merged into ' || coalesce(k.asset_tag, k.id::text) || ' on ' || to_char(now(), 'DD/MM/YYYY')),
    attributes = attributes || jsonb_build_object('merged_into', _keep_id), updated_at = now()
  WHERE id = _remove_id;
END $$;

REVOKE ALL ON FUNCTION public.move_asset_site(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.merge_assets(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_asset_site(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_assets(uuid, uuid) TO authenticated;
