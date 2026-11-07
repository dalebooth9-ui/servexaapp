CREATE OR REPLACE FUNCTION public.preview_building_merge(_source uuid, _keep uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_user_org_id(); s public.sites; k public.sites; r record; n bigint; rows_hash text; details jsonb:='[]'; fingerprint text; blocked boolean:=false;
BEGIN
 IF o IS NULL OR NOT public.has_role_in_org(auth.uid(),o,'admin'::public.app_role) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT * INTO s FROM sites WHERE id=_source AND org_id=o AND deleted_at IS NULL;
 SELECT * INTO k FROM sites WHERE id=_keep AND org_id=o AND deleted_at IS NULL;
 IF s.id IS NULL OR k.id IS NULL OR s.id=k.id OR s.site_type<>'building' OR k.site_type<>'building' OR s.parent_id IS NULL OR s.parent_id IS DISTINCT FROM k.parent_id THEN RAISE EXCEPTION 'Choose two buildings on the same site'; END IF;
 FOR r IN SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND data_type='uuid' AND (column_name IN ('site_id','guess_site_id') OR (table_name='sites' AND column_name='parent_id')) ORDER BY table_name,column_name LOOP
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(t)::text,''|'' ORDER BY to_jsonb(t)::text),'''')) FROM public.%I t WHERE %I=$1',r.table_name,r.column_name) INTO n,rows_hash USING _source;
 IF n>0 THEN
 details:=details||jsonb_build_array(jsonb_build_object('table',r.table_name,'count',n,'hash',rows_hash));
 IF r.table_name NOT IN ('archived_documents','asset_review_flags','assets','audits','compliance_records','defects','fire_log_entries','fire_log_tokens','historic_reports','jobs','portal_visit_requests','renewal_reminder_log','site_surveys','paper_scan_batch_items','asset_service_history','customer_sites','service_contract_sites','site_service_schedules','sites') THEN blocked:=true; END IF;
 END IF;
 END LOOP;
 fingerprint:=md5(to_jsonb(s)::text||to_jsonb(k)::text||details::text);
 RETURN jsonb_build_object('source',s.name,'keep',k.name,'details',details,'fingerprint',fingerprint,'blocked',blocked);
END $$;
REVOKE ALL ON FUNCTION public.preview_building_merge(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_building_merge(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.confirm_building_merge(_source uuid,_keep uuid,_fingerprint text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p jsonb; b uuid; r record; n bigint;
BEGIN
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
END $$;
REVOKE ALL ON FUNCTION public.confirm_building_merge(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_building_merge(uuid,uuid,text) TO authenticated;