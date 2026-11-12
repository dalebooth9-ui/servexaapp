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
  IF NOT public.engineer_can_access_asset(auth.uid(),a.id) THEN RAISE EXCEPTION 'This riser is not on one of your jobs'; END IF;
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