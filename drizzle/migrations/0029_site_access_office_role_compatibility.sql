CREATE OR REPLACE FUNCTION public.site_access_staff_allowed(p_site_id uuid,p_org_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT p_org_id=public.get_user_org_id() AND (public.is_org_admin(p_org_id) OR public.has_role_in_org(auth.uid(),p_org_id,'admin') OR (public.has_role_in_org(auth.uid(),p_org_id,'engineer') AND public.engineer_can_access_site(auth.uid(),p_site_id))); $$;
REVOKE ALL ON FUNCTION public.site_access_staff_allowed(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.site_access_staff_allowed(uuid,uuid) TO authenticated;
ALTER POLICY staff_read ON public.site_access_info USING (org_id=public.get_user_org_id() AND public.site_access_staff_allowed(site_id,org_id));
ALTER POLICY staff_read ON public.site_access_history USING (org_id=public.get_user_org_id() AND public.site_access_staff_allowed(site_id,org_id));
CREATE OR REPLACE FUNCTION public.save_site_access_info(p_site_id uuid,p_details jsonb,p_confirm boolean DEFAULT false) RETURNS public.site_access_info LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.get_user_org_id(); previous jsonb; cleaned jsonb; changed jsonb; result public.site_access_info;
BEGIN
IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.sites WHERE id=p_site_id AND org_id=org AND deleted_at IS NULL) OR NOT public.site_access_staff_allowed(p_site_id,org) THEN RAISE EXCEPTION 'Site access is restricted to office staff and assigned engineers'; END IF;
IF jsonb_typeof(p_details)<>'object' THEN RAISE EXCEPTION 'Invalid access details'; END IF;
PERFORM 1 FROM public.sites WHERE id=p_site_id FOR UPDATE;
SELECT details INTO previous FROM public.site_access_info WHERE site_id=p_site_id;
previous:=coalesce(previous,'{}'::jsonb);
SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO cleaned FROM jsonb_each(p_details) WHERE key=ANY(ARRAY['entry_methods','key_location','access_codes','cabinet_key_type','cabinet_key_held','contact_name','contact_phone','opening_hours','parking','restrictions','notes']);
cleaned:=previous||cleaned;
SELECT coalesce(jsonb_object_agg(key,jsonb_build_object('old',previous->key,'new',value)),'{}'::jsonb) INTO changed FROM jsonb_each(cleaned) WHERE previous->key IS DISTINCT FROM value;
INSERT INTO public.site_access_info(site_id,org_id,details,last_confirmed_at,last_confirmed_by) VALUES(p_site_id,org,cleaned,CASE WHEN p_confirm THEN now() END,CASE WHEN p_confirm THEN auth.uid() END)
ON CONFLICT(site_id) DO UPDATE SET details=excluded.details,updated_at=now(),last_confirmed_at=CASE WHEN p_confirm THEN now() ELSE site_access_info.last_confirmed_at END,last_confirmed_by=CASE WHEN p_confirm THEN auth.uid() ELSE site_access_info.last_confirmed_by END RETURNING * INTO result;
IF changed<>'{}'::jsonb OR p_confirm THEN INSERT INTO public.site_access_history(org_id,site_id,changed_by,changes,confirmed) VALUES(org,p_site_id,auth.uid(),changed,p_confirm); END IF;
RETURN result;
END $$;