CREATE POLICY "Job sheet company boundary" ON public.job_sheet_responses AS RESTRICTIVE FOR ALL TO authenticated USING (org_id=public.get_user_org_id()) WITH CHECK (org_id=public.get_user_org_id());
CREATE TRIGGER zz_sheet_org_links BEFORE INSERT OR UPDATE ON public.job_sheet_responses FOR EACH ROW EXECUTE FUNCTION public.guard_feature_org_references('job_id','jobs');
DROP POLICY "Org members read asset service history" ON public.asset_service_history;
CREATE POLICY "Staff read asset history in company" ON public.asset_service_history FOR SELECT TO authenticated USING (org_id=public.get_user_org_id() AND (public.has_role_in_org(auth.uid(),org_id,'admin') OR public.has_role_in_org(auth.uid(),org_id,'engineer')));
DROP POLICY "Org members read asset review flags" ON public.asset_review_flags;
CREATE POLICY "Staff read asset review flags in company" ON public.asset_review_flags FOR SELECT TO authenticated USING (org_id=public.get_user_org_id() AND (public.has_role_in_org(auth.uid(),org_id,'admin') OR public.has_role_in_org(auth.uid(),org_id,'engineer')));
DO $patch$
DECLARE d text;
BEGIN
 d:=pg_get_functiondef('public.merge_assets(uuid,uuid)'::regprocedure);
 d:=replace(d,'WHERE h.asset_id = _remove_id','WHERE h.asset_id = _remove_id AND h.org_id = v_org');
 d:=replace(d,'WHERE x.asset_id = _keep_id','WHERE x.asset_id = _keep_id AND x.org_id = v_org');
 d:=replace(d,'WHERE asset_id = _remove_id','WHERE asset_id = _remove_id AND org_id = v_org');
 d:=replace(d,'WHERE id = _keep_id','WHERE id = _keep_id AND org_id = v_org');
 d:=replace(d,'WHERE id = _remove_id','WHERE id = _remove_id AND org_id = v_org');
 EXECUTE d;
 d:=pg_get_functiondef('public.move_asset_site(uuid,uuid)'::regprocedure);
 d:=replace(d,'WHERE asset_id = _asset_id','WHERE asset_id = _asset_id AND org_id = v_org');
 d:=replace(d,'WHERE id = _asset_id','WHERE id = _asset_id AND org_id = v_org');
 EXECUTE d;
END $patch$;