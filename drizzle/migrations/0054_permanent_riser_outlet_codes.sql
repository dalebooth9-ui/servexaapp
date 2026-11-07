ALTER TABLE public.riser_outlet_tags ADD COLUMN IF NOT EXISTS is_fitted boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.sync_riser_outlet_codes(_asset_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record; n integer;
BEGIN
 SELECT * INTO a FROM public.assets WHERE id=_asset_id;
 IF a.id IS NULL OR a.merged_into_asset_id IS NOT NULL OR NOT (concat_ws(' ',a.asset_type,a.category) ~* '(dry|wet)[ _-]*riser') THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('outlet_codes:'||a.org_id::text,0));
 FOR n IN 1..GREATEST(COALESCE(a.outlets_count,0),0) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.riser_outlet_tags t WHERE t.asset_id=a.id AND t.outlet_number=n) THEN
   INSERT INTO public.riser_outlet_tags(org_id,asset_id,outlet_number,outlet_tag) VALUES(a.org_id,a.id,n,public.generate_asset_tag(a.org_id)) ON CONFLICT (asset_id,outlet_number) DO NOTHING;
  END IF;
 END LOOP;
 UPDATE public.riser_outlet_tags t SET is_fitted=(t.outlet_number<=GREATEST(COALESCE(a.outlets_count,0),0)) WHERE t.asset_id=a.id AND t.org_id=a.org_id AND t.is_fitted IS DISTINCT FROM (t.outlet_number<=GREATEST(COALESCE(a.outlets_count,0),0));
END $$;
REVOKE ALL ON FUNCTION public.sync_riser_outlet_codes(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_riser_outlet_codes(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.sync_riser_outlet_codes_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN PERFORM public.sync_riser_outlet_codes(NEW.id); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.sync_riser_outlet_codes_trigger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER assets_sync_outlet_codes AFTER INSERT OR UPDATE OF outlets_count,asset_type,category ON public.assets FOR EACH ROW EXECUTE FUNCTION public.sync_riser_outlet_codes_trigger();
CREATE OR REPLACE FUNCTION public.ensure_riser_outlet_tags(_asset_ids uuid[]) RETURNS TABLE(id uuid,asset_id uuid,outlet_number integer,outlet_tag text,label_printed_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_user_org_id(); a record;
BEGIN
 IF o IS NULL OR NOT public.has_role_in_org(auth.uid(),o,'admin') THEN RAISE EXCEPTION 'Office only'; END IF;
 FOR a IN SELECT x.id FROM public.assets x WHERE x.org_id=o AND x.id=ANY(_asset_ids) ORDER BY x.id LOOP PERFORM public.sync_riser_outlet_codes(a.id); END LOOP;
 RETURN QUERY SELECT t.id,t.asset_id,t.outlet_number,t.outlet_tag,t.label_printed_at FROM public.riser_outlet_tags t JOIN public.assets x ON x.id=t.asset_id AND x.org_id=t.org_id WHERE t.org_id=o AND t.asset_id=ANY(_asset_ids) AND t.is_fitted AND t.outlet_number<=COALESCE(x.outlets_count,0) ORDER BY t.asset_id,t.outlet_number;
END $$;
REVOKE ALL ON FUNCTION public.ensure_riser_outlet_tags(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ensure_riser_outlet_tags(uuid[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.asset_outlet_codes(_asset_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE o uuid:=public.get_user_org_id(); target uuid; result jsonb; BEGIN
 IF o IS NULL OR public.is_customer_user(auth.uid()) OR NOT(public.has_role_in_org(auth.uid(),o,'admin') OR public.has_role_in_org(auth.uid(),o,'engineer')) THEN RAISE EXCEPTION 'Staff only'; END IF;
 target:=public.canonical_asset_id(_asset_id,o);
 SELECT jsonb_build_object('total',outlets_count,'tags',(SELECT COALESCE(jsonb_object_agg(t.outlet_tag,t.outlet_number),'{}'::jsonb) FROM public.riser_outlet_tags t WHERE t.org_id=o AND public.canonical_asset_id(t.asset_id,o)=target AND t.is_fitted AND t.outlet_number<=COALESCE(a.outlets_count,0))) INTO result FROM public.assets a WHERE a.id=target AND a.org_id=o; RETURN result; END $$;