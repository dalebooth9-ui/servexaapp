ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS inlets_count integer DEFAULT 1;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS floors_served text;

CREATE OR REPLACE FUNCTION public.set_riser_outlet_count(_asset_id uuid, _count integer, _confirmed boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_user_org_id(); a public.assets%ROWTYPE; is_admin boolean; fitted integer; risky jsonb;
BEGIN
 IF o IS NULL OR public.is_customer_user(auth.uid()) THEN RAISE EXCEPTION 'Staff only'; END IF;
 is_admin:=public.has_role_in_org(auth.uid(),o,'admin');
 IF NOT is_admin AND NOT public.has_role_in_org(auth.uid(),o,'engineer') THEN RAISE EXCEPTION 'Staff only'; END IF;
 IF _count IS NOT NULL AND (_count<0 OR _count>200) THEN RAISE EXCEPTION 'Number of outlets must be between 0 and 200'; END IF;
 SELECT * INTO a FROM public.assets WHERE id=_asset_id AND org_id=o AND merged_into_asset_id IS NULL FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Riser not found'; END IF;
 IF NOT is_admin THEN
  IF a.outlets_count IS NOT NULL AND a.outlets_count>0 THEN RAISE EXCEPTION 'Outlet count already set. Ask the office to change it'; END IF;
  IF NOT public.engineer_can_access_asset(a.id) THEN RAISE EXCEPTION 'This riser is not on one of your jobs'; END IF;
 END IF;
 SELECT count(*) INTO fitted FROM public.riser_outlet_tags t WHERE t.asset_id=a.id AND t.org_id=o AND t.is_fitted;
 IF COALESCE(_count,0)<fitted THEN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('outlet_tag',x.outlet_tag,'outlet_number',x.outlet_number,'printed',x.label_printed_at IS NOT NULL,'history',x.has_history) ORDER BY x.outlet_number),'[]'::jsonb) INTO risky
  FROM (SELECT t.*, (t.last_scanned_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.riser_outlet_scans s WHERE s.outlet_tag_id=t.id)) AS has_history
        FROM public.riser_outlet_tags t WHERE t.asset_id=a.id AND t.org_id=o AND t.is_fitted ORDER BY t.outlet_number DESC LIMIT (fitted-COALESCE(_count,0))) x
  WHERE x.label_printed_at IS NOT NULL OR x.has_history;
  IF jsonb_array_length(risky)>0 AND NOT _confirmed THEN RETURN jsonb_build_object('needs_confirmation',true,'outlets',risky); END IF;
 END IF;
 UPDATE public.assets SET outlets_count=_count, updated_at=now() WHERE id=a.id AND org_id=o;
 RETURN jsonb_build_object('ok',true,'outlets_count',_count);
END $$;
REVOKE ALL ON FUNCTION public.set_riser_outlet_count(uuid,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_riser_outlet_count(uuid,integer,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_site_riser_job_with_new_risers(_site_id uuid, _request_id uuid, _details jsonb, _riser_ids uuid[], _new_risers jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_user_org_id(); r jsonb; ids uuid[]:=COALESCE(_riser_ids,ARRAY[]::uuid[]); new_id uuid; loc text; oc integer; ic integer; existing uuid; typ text;
BEGIN
 IF o IS NULL OR NOT public.is_org_active(o) OR NOT public.has_role_in_org(auth.uid(),o,'admin') THEN RAISE EXCEPTION 'Office access required'; END IF;
 IF _request_id IS NULL THEN RAISE EXCEPTION 'Missing request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(o::text||_request_id::text,0));
 SELECT id INTO existing FROM public.jobs WHERE org_id=o AND riser_visit_request_id=_request_id; IF existing IS NOT NULL THEN RETURN existing; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=_site_id AND org_id=o AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Site not found'; END IF;
 FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_new_risers,'[]'::jsonb)) LOOP
  loc:=nullif(btrim(r->>'location'),'');
  IF loc IS NULL THEN RAISE EXCEPTION 'Enter a name or location for every new riser'; END IF;
  oc:=nullif(r->>'outlets','')::integer; ic:=COALESCE(nullif(r->>'inlets','')::integer,1);
  IF oc IS NOT NULL AND (oc<0 OR oc>200) THEN RAISE EXCEPTION 'Number of outlets for % must be between 0 and 200',loc; END IF;
  IF ic<1 OR ic>20 THEN RAISE EXCEPTION 'Number of inlets for % must be between 1 and 20',loc; END IF;
  typ:=CASE WHEN r->>'kind'='wet' THEN 'Wet Riser' ELSE 'Dry Riser' END;
  INSERT INTO public.assets(name,site_id,category,asset_type,riser_location,outlets_count,inlets_count,floors_served,cabinet_key_type,status,org_id)
  VALUES(typ||' - '||loc,_site_id,typ,typ,loc,oc,ic,nullif(btrim(r->>'floors'),''),nullif(btrim(r->>'cabinet_keys'),''),'operational',o) RETURNING id INTO new_id;
  ids:=ids||new_id;
 END LOOP;
 RETURN public.create_site_riser_job(_site_id,_request_id,_details,ids);
END $$;
REVOKE ALL ON FUNCTION public.create_site_riser_job_with_new_risers(uuid,uuid,jsonb,uuid[],jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_site_riser_job_with_new_risers(uuid,uuid,jsonb,uuid[],jsonb) TO authenticated;