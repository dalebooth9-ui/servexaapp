ALTER TABLE public.defects ADD COLUMN IF NOT EXISTS source_key text;
CREATE UNIQUE INDEX IF NOT EXISTS defects_source_response_key_uniq
  ON public.defects(source_response_id, source_key) WHERE source_response_id IS NOT NULL AND source_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.report_defect_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  response_id uuid NOT NULL REFERENCES public.job_sheet_responses(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  dismissed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, source_key)
);
GRANT SELECT ON public.report_defect_dismissals TO authenticated;
GRANT ALL ON public.report_defect_dismissals TO service_role;
ALTER TABLE public.report_defect_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read dismissals" ON public.report_defect_dismissals
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());

CREATE OR REPLACE FUNCTION public.capture_defects_from_response(_response_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_resp public.job_sheet_responses; v_job public.jobs; v_fields jsonb; v_tname text;
  v_key text; v_val jsonb; v_txt text; v_type text; v_label text; v_section text; v_note text;
  v_asset uuid; v_cat text; v_n integer := 0; v_id uuid;
BEGIN
  SELECT * INTO v_resp FROM public.job_sheet_responses WHERE id = _response_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = v_resp.job_id;
  IF NOT FOUND OR COALESCE(v_job.historic_backfill,false) THEN RETURN 0; END IF;
  SELECT fields, name INTO v_fields, v_tname FROM public.job_sheet_templates WHERE id = v_resp.template_id;
  v_fields := COALESCE(v_fields, '[]'::jsonb);
  BEGIN v_asset := NULLIF(v_resp.responses->>'riser_asset_id','')::uuid; EXCEPTION WHEN others THEN v_asset := NULL; END;
  IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.assets WHERE id=v_asset AND org_id=v_resp.org_id) THEN v_asset := NULL; END IF;
  v_cat := CASE WHEN COALESCE(v_tname,'') ILIKE '%riser%' THEN 'dry_riser' ELSE 'other' END;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(COALESCE(v_resp.responses,'{}'::jsonb)) LOOP
    CONTINUE WHEN left(v_key,1) = '_' OR v_key ~* 'note|comment|material|photo|remedial|required_|clean';
    SELECT f->>'type', f->>'label', f->>'section' INTO v_type, v_label, v_section
      FROM jsonb_array_elements(v_fields) f WHERE f->>'id' = v_key LIMIT 1;
    v_txt := CASE jsonb_typeof(v_val) WHEN 'string' THEN btrim(v_val #>> '{}') WHEN 'boolean' THEN v_val::text ELSE NULL END;
    CONTINUE WHEN v_txt IS NULL;
    IF NOT (
      (jsonb_typeof(v_val)='boolean' AND v_val = 'false'::jsonb AND v_type = 'checkbox')
      OR upper(v_txt) IN ('NO','FAIL','FAILED','UNSATISFACTORY','DEFECTIVE','POOR')
    ) THEN CONTINUE; END IF;
    v_label := COALESCE(NULLIF(btrim(v_label),''), initcap(regexp_replace(v_key,'[_-]+',' ','g')));
    v_note := NULLIF(btrim(COALESCE(v_resp.responses->>(v_key||'_notes'), v_resp.responses->>(v_key||'_note'), '')), '');
    INSERT INTO public.defects (org_id, site_id, job_id, asset_id, reported_by, title, description, severity, status,
      category, photos, source_response_id, source_key, source_kind, location_on_site)
    VALUES (v_resp.org_id, v_job.site_id, v_job.id, v_asset, v_resp.submitted_by,
      left('Failed check: ' || v_label, 200),
      concat_ws(E'\n', 'Answered ' || CASE WHEN v_txt='false' THEN 'NO' ELSE upper(v_txt) END || ' on the report.', v_note),
      'medium', 'open', v_cat, '[]'::jsonb, v_resp.id, 'check:' || v_key, 'job', v_section)
    ON CONFLICT (source_response_id, source_key) WHERE source_response_id IS NOT NULL AND source_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN v_n := v_n + 1; v_id := NULL; END IF;
  END LOOP;
  RETURN v_n;
END $function$;
REVOKE ALL ON FUNCTION public.capture_defects_from_response(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_defects_from_response(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_report_defect_suggestions(_response_id uuid, _items jsonb, _dismiss text[] DEFAULT '{}')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_resp public.job_sheet_responses; v_job public.jobs; v_it jsonb; v_asset uuid; v_n integer := 0; v_id uuid; k text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO v_resp FROM public.job_sheet_responses WHERE id = _response_id;
  IF NOT FOUND OR v_resp.org_id IS DISTINCT FROM public.get_user_org_id() THEN RAISE EXCEPTION 'Report not found'; END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = v_resp.job_id;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.can_act_on_job(v_job.id)) THEN RAISE EXCEPTION 'You cannot add defects to this job'; END IF;
  BEGIN v_asset := NULLIF(v_resp.responses->>'riser_asset_id','')::uuid; EXCEPTION WHEN others THEN v_asset := NULL; END;
  IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.assets WHERE id=v_asset AND org_id=v_resp.org_id) THEN v_asset := NULL; END IF;

  FOR v_it IN SELECT * FROM jsonb_array_elements(COALESCE(_items,'[]'::jsonb)) LOOP
    CONTINUE WHEN COALESCE(btrim(v_it->>'key'),'') = '' OR COALESCE(btrim(v_it->>'title'),'') = '';
    INSERT INTO public.defects (org_id, site_id, job_id, asset_id, reported_by, title, description, severity, status,
      category, photos, linked_photo_url, source_response_id, source_key, source_kind, location_on_site, works_required, materials_required)
    VALUES (v_resp.org_id, v_job.site_id, v_job.id, v_asset, auth.uid(), left(v_it->>'title',200),
      NULLIF(v_it->>'description',''), 'medium', 'open',
      CASE WHEN EXISTS (SELECT 1 FROM job_sheet_templates t WHERE t.id=v_resp.template_id AND t.name ILIKE '%riser%') THEN 'dry_riser' ELSE 'other' END,
      '[]'::jsonb, NULLIF(v_it->>'photo',''), v_resp.id, 'suggest:' || (v_it->>'key'), 'job',
      NULLIF(v_it->>'location',''), NULLIF(v_it->>'works_required',''), NULLIF(v_it->>'materials_required',''))
    ON CONFLICT (source_response_id, source_key) WHERE source_response_id IS NOT NULL AND source_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN v_n := v_n + 1; v_id := NULL; END IF;
  END LOOP;
  FOREACH k IN ARRAY COALESCE(_dismiss,'{}') LOOP
    INSERT INTO public.report_defect_dismissals(org_id,response_id,source_key,dismissed_by)
    VALUES (v_resp.org_id, v_resp.id, 'suggest:'||k, auth.uid()) ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN v_n;
END $function$;
REVOKE ALL ON FUNCTION public.confirm_report_defect_suggestions(uuid, jsonb, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_report_defect_suggestions(uuid, jsonb, text[]) TO authenticated;