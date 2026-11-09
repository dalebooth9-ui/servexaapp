ALTER TABLE public.assets ADD COLUMN outlet_number_high_water integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.assets.outlet_number_high_water IS 'Highest outlet suffix ever allocated; removed numbers must never be reused.';
UPDATE public.assets a SET outlet_number_high_water=COALESCE((SELECT max(t.outlet_number) FROM public.riser_outlet_tags t WHERE t.asset_id=a.id AND t.org_id=a.org_id),0);
CREATE OR REPLACE FUNCTION public.sync_riser_outlet_codes(_asset_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record; fitted integer; target integer; n integer;
BEGIN
 SELECT * INTO a FROM public.assets WHERE id=_asset_id FOR UPDATE;
 IF a.id IS NULL OR a.merged_into_asset_id IS NOT NULL OR a.asset_tag IS NULL OR NOT (concat_ws(' ',a.asset_type,a.category) ~* '(dry|wet)[ _-]*riser') THEN RETURN; END IF;
 target:=GREATEST(COALESCE(a.outlets_count,0),0);
 SELECT count(*) INTO fitted FROM public.riser_outlet_tags t WHERE t.asset_id=a.id AND t.org_id=a.org_id AND t.is_fitted;
 IF fitted>target THEN
 UPDATE public.riser_outlet_tags t SET is_fitted=false WHERE t.id IN (SELECT x.id FROM public.riser_outlet_tags x WHERE x.asset_id=a.id AND x.org_id=a.org_id AND x.is_fitted ORDER BY x.outlet_number DESC LIMIT (fitted-target));
 END IF;
 n:=GREATEST(a.outlet_number_high_water,COALESCE((SELECT max(t.outlet_number) FROM public.riser_outlet_tags t WHERE t.asset_id=a.id AND t.org_id=a.org_id),0));
 IF fitted<target THEN
 FOR i IN 1..(target-fitted) LOOP
 n:=n+1;
 INSERT INTO public.riser_outlet_tags(org_id,asset_id,outlet_number,outlet_tag,is_fitted) VALUES(a.org_id,a.id,n,a.asset_tag||'-'||n,true);
 END LOOP;
 END IF;
 UPDATE public.assets SET outlet_number_high_water=n WHERE id=a.id AND org_id=a.org_id AND outlet_number_high_water IS DISTINCT FROM n;
END $$;
REVOKE ALL ON FUNCTION public.sync_riser_outlet_codes(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_riser_outlet_codes(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.ensure_riser_outlet_tags(_asset_ids uuid[]) RETURNS TABLE(id uuid,asset_id uuid,outlet_number integer,outlet_tag text,label_printed_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_user_org_id(); a record;
BEGIN
 IF o IS NULL OR NOT public.has_role_in_org(auth.uid(),o,'admin') THEN RAISE EXCEPTION 'Office only'; END IF;
 FOR a IN SELECT x.id FROM public.assets x WHERE x.org_id=o AND x.id=ANY(_asset_ids) ORDER BY x.id LOOP PERFORM public.sync_riser_outlet_codes(a.id); END LOOP;
 RETURN QUERY SELECT t.id,t.asset_id,t.outlet_number,t.outlet_tag,t.label_printed_at FROM public.riser_outlet_tags t JOIN public.assets x ON x.id=t.asset_id AND x.org_id=t.org_id WHERE t.org_id=o AND t.asset_id=ANY(_asset_ids) AND t.is_fitted ORDER BY t.asset_id,t.outlet_number;
END $$;
REVOKE ALL ON FUNCTION public.ensure_riser_outlet_tags(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ensure_riser_outlet_tags(uuid[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.asset_outlet_codes(_asset_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE o uuid:=public.get_user_org_id(); target uuid; result jsonb; BEGIN
 IF o IS NULL OR public.is_customer_user(auth.uid()) OR NOT(public.has_role_in_org(auth.uid(),o,'admin') OR public.has_role_in_org(auth.uid(),o,'engineer')) THEN RAISE EXCEPTION 'Staff only'; END IF;
 target:=public.canonical_asset_id(_asset_id,o);
 SELECT jsonb_build_object('total',outlets_count,'tags',(SELECT COALESCE(jsonb_object_agg(t.outlet_tag,t.outlet_number),'{}'::jsonb) FROM public.riser_outlet_tags t WHERE t.org_id=o AND public.canonical_asset_id(t.asset_id,o)=target AND t.is_fitted)) INTO result FROM public.assets a WHERE a.id=target AND a.org_id=o; RETURN result; END $$;
REVOKE ALL ON FUNCTION public.asset_outlet_codes(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asset_outlet_codes(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.record_outlet_scan(_tag text) RETURNS TABLE(asset_tag text,outlet_number integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_user_org_id(); r record;
BEGIN
 IF _org IS NULL OR public.is_customer_user(auth.uid()) OR NOT(public.has_role_in_org(auth.uid(),_org,'admin') OR public.has_role_in_org(auth.uid(),_org,'engineer')) THEN RETURN; END IF;
 SELECT t.id,a.id AS asset_id,t.outlet_number,a.asset_tag INTO r FROM public.riser_outlet_tags t JOIN public.assets a ON a.id=public.canonical_asset_id(t.asset_id,t.org_id) AND a.org_id=t.org_id WHERE t.org_id=_org AND t.is_fitted AND upper(t.outlet_tag)=upper(_tag) LIMIT 1;
 IF r.id IS NULL THEN RETURN; END IF;
 INSERT INTO public.riser_outlet_scans(org_id,outlet_tag_id,asset_id,scanned_by) VALUES(_org,r.id,r.asset_id,auth.uid());
 UPDATE public.riser_outlet_tags SET last_scanned_at=now(),last_scanned_by=auth.uid() WHERE id=r.id AND org_id=_org;
 asset_tag:=r.asset_tag; outlet_number:=r.outlet_number; RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.record_outlet_scan(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_outlet_scan(text) TO authenticated;