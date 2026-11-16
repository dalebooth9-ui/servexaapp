REVOKE EXECUTE ON FUNCTION public.apply_backfill_rewrites(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_backfill_rewrites(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.job_merge_snapshot(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_merge_snapshot(uuid[]) TO service_role;
REVOKE EXECUTE ON FUNCTION public.delete_empty_customers(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.merge_customers(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.confirm_building_merge(uuid, uuid, text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.confirm_building_merge(_source uuid, _keep uuid, _fingerprint text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p jsonb; b uuid; r record; n bigint; _org uuid := public.get_user_org_id(auth.uid());
BEGIN
 IF _org IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
   RAISE EXCEPTION 'Only an admin can merge buildings';
 END IF;
 IF (SELECT count(*) FROM public.sites WHERE id IN (_source,_keep) AND org_id = _org) <> 2 OR _source = _keep THEN
   RAISE EXCEPTION 'Buildings not found in your company';
 END IF;
 PERFORM id FROM public.sites WHERE id IN (_source,_keep) ORDER BY id FOR UPDATE;
 p:=public.preview_building_merge(_source,_keep);
 IF p->>'fingerprint' IS DISTINCT FROM _fingerprint THEN RAISE EXCEPTION 'Building records changed. Open a fresh preview before merging.'; END IF;
 IF (p->>'blocked')::boolean THEN RAISE EXCEPTION 'This building has linked records requiring a separate review. Nothing changed.'; END IF;
 b:=public.merge_sites(jsonb_build_array(jsonb_build_object('keep',_keep,'dups',jsonb_build_array(_source))));
 FOR r IN SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND data_type='uuid' AND (column_name IN ('site_id','guess_site_id') OR (table_name='sites' AND column_name='parent_id')) LOOP
 EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.table_name,r.column_name) INTO n USING _source;
 IF n>0 THEN RAISE EXCEPTION 'Some attached records could not safely move. Nothing changed; review the building links.'; END IF;
 END LOOP;
 RETURN b;
END $function$;
REVOKE EXECUTE ON FUNCTION public.confirm_building_merge(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_building_merge(uuid, uuid, text) TO authenticated, service_role;