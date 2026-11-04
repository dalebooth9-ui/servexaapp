DO $patch$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.sync_asset_from_job_sheet(uuid)'::regprocedure);
 d:=replace(d,'IF NOT FOUND OR r.status <> ''submitted'' THEN RETURN; END IF; IF auth.uid() IS NOT NULL AND r.org_id IS DISTINCT FROM public.get_user_org_id() THEN RAISE EXCEPTION ''Report belongs to another organisation''; END IF;', 'IF NOT FOUND THEN RETURN; END IF; IF auth.uid() IS NOT NULL AND r.org_id IS DISTINCT FROM public.get_user_org_id() THEN RAISE EXCEPTION ''Report belongs to another organisation''; END IF; IF r.status <> ''submitted'' THEN RETURN; END IF;');
 EXECUTE d;
END $patch$;