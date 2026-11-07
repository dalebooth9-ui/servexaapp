DO $patch$ DECLARE d text; BEGIN
SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE oid='public.canonical_asset_id(uuid,uuid)'::regprocedure;
d:=replace(d,'BEGIN FOR i IN 1..20','BEGIN IF auth.uid() IS NOT NULL AND _org IS DISTINCT FROM public.get_user_org_id() THEN RETURN NULL; END IF; FOR i IN 1..20'); EXECUTE d;
SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE oid='public.upsert_asset_rows(jsonb,text)'::regprocedure;
d:=replace(d,'a.org_id:=o; a.name:=btrim(a.name);','a.org_id:=o; a.name:=btrim(a.name); PERFORM pg_advisory_xact_lock(hashtextextended(o::text||'':asset-merge'',0));');
d:=replace(d,'a.category:=coalesce(nullif(a.category,''''),''general'');','a.category:=coalesce(nullif(a.category,''''),''general''); IF lower(replace(a.category,''_'','' '')) IN (''dry riser'',''wet riser'') THEN a.category:=CASE WHEN lower(replace(a.category,''_'','' ''))=''wet riser'' THEN ''Wet Riser'' ELSE ''Dry Riser'' END; a.asset_type:=a.category; END IF;'); EXECUTE d;
SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE oid='public.sync_asset_from_job_sheet(uuid)'::regprocedure;
d:=replace(d,'PERFORM pg_advisory_xact_lock(hashtextextended(j.org_id::text||j.site_id::text||''riser-sync'',0));','PERFORM pg_advisory_xact_lock(hashtextextended(j.org_id::text||'':asset-merge'',0)); PERFORM pg_advisory_xact_lock(hashtextextended(j.org_id::text||j.site_id::text||''riser-sync'',0));'); EXECUTE d;
SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE oid='public.riser_type_by_tag(text)'::regprocedure;
d:=replace(d,'FROM public.assets a','FROM public.assets source JOIN public.assets a ON a.id=public.canonical_asset_id(source.id,source.org_id) AND a.org_id=source.org_id'); d:=replace(d,'upper(a.asset_tag) = upper(_tag)','upper(source.asset_tag) = upper(_tag)'); EXECUTE d;
END $patch$;