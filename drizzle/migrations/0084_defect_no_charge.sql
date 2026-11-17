ALTER TABLE public.defects ADD COLUMN IF NOT EXISTS chargeable boolean NOT NULL DEFAULT true;

CREATE TABLE public.defect_no_charge_details (
  defect_id uuid PRIMARY KEY REFERENCES public.defects(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  reason text,
  materials_cost numeric(10,2) NOT NULL DEFAULT 0,
  labour_hours numeric(6,2) NOT NULL DEFAULT 0,
  labour_cost numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.defect_no_charge_details TO authenticated;
GRANT ALL ON public.defect_no_charge_details TO service_role;
ALTER TABLE public.defect_no_charge_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Office reads no-charge details" ON public.defect_no_charge_details FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "Office writes no-charge details" ON public.defect_no_charge_details FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.defects d WHERE d.id = defect_id AND d.org_id = defect_no_charge_details.org_id));
CREATE POLICY "Office updates no-charge details" ON public.defect_no_charge_details FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "Office deletes no-charge details" ON public.defect_no_charge_details FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

-- No-charge defects can never be quoted, whichever path tries.
CREATE OR REPLACE FUNCTION public.block_quoting_no_charge_defect()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.chargeable = false AND NEW.quote_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.quote_id IS DISTINCT FROM OLD.quote_id OR OLD.chargeable IS DISTINCT FROM NEW.chargeable) THEN
    RAISE EXCEPTION 'This defect is marked No charge (our work) and cannot be quoted. Change it to Chargeable first.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_block_quoting_no_charge BEFORE INSERT OR UPDATE OF quote_id, chargeable ON public.defects
  FOR EACH ROW EXECUTE FUNCTION public.block_quoting_no_charge_defect();

-- Office sets Chargeable / No charge with optional internal reason.
CREATE OR REPLACE FUNCTION public.set_defect_chargeable(_defect_id uuid, _chargeable boolean, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v public.defects;
BEGIN
  SELECT * INTO v FROM public.defects WHERE id = _defect_id;
  IF NOT FOUND OR v.org_id IS DISTINCT FROM public.get_user_org_id() THEN RAISE EXCEPTION 'Defect not found'; END IF;
  IF NOT public.has_role_in_org(auth.uid(), v.org_id, 'admin'::app_role) THEN RAISE EXCEPTION 'Only office staff can change whether a defect is chargeable'; END IF;
  IF NOT _chargeable AND v.quote_id IS NOT NULL THEN RAISE EXCEPTION 'This defect is already on a quote. Remove it from the quote before marking it No charge.'; END IF;
  UPDATE public.defects SET chargeable = _chargeable, updated_at = now() WHERE id = _defect_id;
  IF NOT _chargeable THEN
    INSERT INTO public.defect_no_charge_details(defect_id, org_id, reason, updated_by)
    VALUES (_defect_id, v.org_id, NULLIF(btrim(_reason),''), auth.uid())
    ON CONFLICT (defect_id) DO UPDATE SET reason = COALESCE(NULLIF(btrim(_reason),''), defect_no_charge_details.reason), updated_by = auth.uid(), updated_at = now();
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_defect_chargeable(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_defect_chargeable(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_report_defect_suggestions(_response_id uuid, _items jsonb, _dismiss text[] DEFAULT '{}')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_resp public.job_sheet_responses; v_job public.jobs; v_it jsonb; v_asset uuid; v_n integer := 0; v_id uuid; k text; v_charge boolean;
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
    v_charge := COALESCE((v_it->>'chargeable')::boolean, true);
    INSERT INTO public.defects (org_id, site_id, job_id, asset_id, reported_by, title, description, severity, status,
      category, photos, linked_photo_url, source_response_id, source_key, source_kind, location_on_site, works_required, materials_required, chargeable)
    VALUES (v_resp.org_id, v_job.site_id, v_job.id, v_asset, auth.uid(), left(v_it->>'title',200),
      NULLIF(v_it->>'description',''), 'medium', 'open',
      CASE WHEN EXISTS (SELECT 1 FROM job_sheet_templates t WHERE t.id=v_resp.template_id AND t.name ILIKE '%riser%') THEN 'dry_riser' ELSE 'other' END,
      '[]'::jsonb, NULLIF(v_it->>'photo',''), v_resp.id, 'suggest:' || (v_it->>'key'), 'job',
      NULLIF(v_it->>'location',''), NULLIF(v_it->>'works_required',''), NULLIF(v_it->>'materials_required',''), v_charge)
    ON CONFLICT (source_response_id, source_key) WHERE source_response_id IS NOT NULL AND source_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_n := v_n + 1;
      IF NOT v_charge THEN
        INSERT INTO public.defect_no_charge_details(defect_id, org_id, reason, updated_by)
        VALUES (v_id, v_resp.org_id, NULLIF(btrim(v_it->>'no_charge_reason'),''), auth.uid()) ON CONFLICT DO NOTHING;
      END IF;
      v_id := NULL;
    END IF;
  END LOOP;
  FOREACH k IN ARRAY COALESCE(_dismiss,'{}') LOOP
    INSERT INTO public.report_defect_dismissals(org_id,response_id,source_key,dismissed_by)
    VALUES (v_resp.org_id, v_resp.id, 'suggest:'||k, auth.uid()) ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN v_n;
END $function$;
REVOKE ALL ON FUNCTION public.confirm_report_defect_suggestions(uuid, jsonb, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_report_defect_suggestions(uuid, jsonb, text[]) TO authenticated;