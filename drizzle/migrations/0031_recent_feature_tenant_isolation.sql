-- Preserve every row; replace system-wide sticker uniqueness with company uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS assets_org_asset_tag_key ON public.assets(org_id, asset_tag);
ALTER TABLE public.assets DROP CONSTRAINT assets_asset_tag_key;
ALTER TABLE public.assets ALTER COLUMN org_id SET NOT NULL;
CREATE OR REPLACE FUNCTION public.generate_asset_tag(_org_id uuid)
RETURNS text LANGUAGE plpgsql SET search_path=public AS $$
DECLARE chars constant text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; t text; i int; attempt int:=0;
BEGIN
 IF _org_id IS NULL THEN RAISE EXCEPTION 'Organisation required'; END IF;
 LOOP
  t:=''; FOR i IN 1..6 LOOP t:=t||substr(chars,1+floor(random()*length(chars))::int,1); END LOOP;
  EXIT WHEN NOT EXISTS(SELECT 1 FROM public.assets WHERE org_id=_org_id AND asset_tag=t);
  attempt:=attempt+1; IF attempt>50 THEN RAISE EXCEPTION 'Could not generate unique asset tag'; END IF;
 END LOOP; RETURN t;
END $$;
CREATE OR REPLACE FUNCTION public.generate_asset_tag() RETURNS text LANGUAGE sql SET search_path=public AS $$ SELECT public.generate_asset_tag(public.get_user_org_id()); $$;
CREATE OR REPLACE FUNCTION public.tg_assign_asset_tag() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL THEN NEW.org_id:=public.get_user_org_id(); END IF;
 IF NEW.org_id IS NULL THEN RAISE EXCEPTION 'Organisation required'; END IF;
 IF NEW.asset_tag IS NULL OR btrim(NEW.asset_tag)='' THEN NEW.asset_tag:=public.generate_asset_tag(NEW.org_id); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.generate_asset_tag(uuid), public.generate_asset_tag() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_asset_tag(uuid), public.generate_asset_tag() TO authenticated, service_role;

-- Enforce same-company links even when a service-role importer bypasses RLS.
CREATE OR REPLACE FUNCTION public.guard_feature_org_references() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row_json jsonb:=to_jsonb(NEW); old_json jsonb; o uuid; ref uuid; target_org uuid; n int; col text; target text;
BEGIN
 o:=(row_json->>'org_id')::uuid;
 IF o IS NULL THEN RAISE EXCEPTION 'Organisation required'; END IF;
 IF TG_OP='UPDATE' THEN old_json:=to_jsonb(OLD); IF old_json->>'org_id' IS DISTINCT FROM row_json->>'org_id' THEN RAISE EXCEPTION 'Organisation cannot be changed'; END IF; END IF;
 IF auth.uid() IS NOT NULL AND o IS DISTINCT FROM public.get_user_org_id() THEN RAISE EXCEPTION 'Record belongs to another organisation'; END IF;
 n:=0; WHILE n<TG_NARGS LOOP
  col:=TG_ARGV[n]; target:=TG_ARGV[n+1]; ref:=nullif(row_json->>col,'')::uuid;
  IF ref IS NOT NULL THEN
   EXECUTE format('SELECT org_id FROM public.%I WHERE id=$1',target) INTO target_org USING ref;
   IF target_org IS DISTINCT FROM o THEN RAISE EXCEPTION 'Linked % must belong to the same organisation',col; END IF;
  END IF; n:=n+2;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_assets_org_links BEFORE INSERT OR UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.guard_feature_org_references('site_id','sites','import_batch_id','import_batches','last_job_id','jobs','last_job_sheet_response_id','job_sheet_responses');
CREATE TRIGGER zz_history_org_links BEFORE INSERT OR UPDATE ON public.asset_service_history FOR EACH ROW EXECUTE FUNCTION public.guard_feature_org_references('site_id','sites','asset_id','assets','job_id','jobs','job_sheet_response_id','job_sheet_responses');
CREATE TRIGGER zz_review_org_links BEFORE INSERT OR UPDATE ON public.asset_review_flags FOR EACH ROW EXECUTE FUNCTION public.guard_feature_org_references('site_id','sites','asset_id','assets','job_id','jobs','job_sheet_response_id','job_sheet_responses');
CREATE TRIGGER zz_defect_org_links BEFORE INSERT OR UPDATE ON public.defects FOR EACH ROW EXECUTE FUNCTION public.guard_feature_org_references('site_id','sites','asset_id','assets','job_id','jobs');
CREATE TRIGGER zz_historic_org_links BEFORE INSERT OR UPDATE ON public.historic_reports FOR EACH ROW EXECUTE FUNCTION public.guard_feature_org_references('site_id','sites','asset_id','assets','customer_id','customers','job_id','jobs');
CREATE TRIGGER zz_customer_site_org_links BEFORE INSERT OR UPDATE ON public.customer_sites FOR EACH ROW EXECUTE FUNCTION public.guard_feature_org_references('site_id','sites','customer_id','customers');
CREATE TRIGGER zz_access_org_links BEFORE INSERT OR UPDATE ON public.site_access_info FOR EACH ROW EXECUTE FUNCTION public.guard_feature_org_references('site_id','sites');
CREATE TRIGGER zz_access_history_org_links BEFORE INSERT OR UPDATE ON public.site_access_history FOR EACH ROW EXECUTE FUNCTION public.guard_feature_org_references('site_id','sites');
CREATE TRIGGER zz_merge_log_org_links BEFORE INSERT OR UPDATE ON public.site_merge_log FOR EACH ROW EXECUTE FUNCTION public.guard_feature_org_references('kept_site_id','sites','merged_site_id','sites');

CREATE OR REPLACE FUNCTION public.site_access_staff_allowed(p_site_id uuid,p_org_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND p_org_id=public.get_user_org_id() AND public.is_org_active(p_org_id)
 AND NOT public.is_customer_user(auth.uid())
 AND EXISTS(SELECT 1 FROM public.sites s WHERE s.id=p_site_id AND s.org_id=p_org_id AND s.deleted_at IS NULL)
 AND (public.has_role_in_org(auth.uid(),p_org_id,'admin') OR (public.has_role_in_org(auth.uid(),p_org_id,'engineer') AND EXISTS(
 SELECT 1 FROM public.jobs j JOIN public.job_assignments ja ON ja.job_id=j.id
 WHERE j.site_id=p_site_id AND j.org_id=p_org_id AND ja.org_id=p_org_id AND ja.engineer_id=auth.uid())));
$$;

-- A broad same-org historic policy must not bypass the customer shareable policy.
DROP POLICY "Org members read historic_reports" ON public.historic_reports;
DROP POLICY "Org members update historic_reports" ON public.historic_reports;
CREATE POLICY "Staff read historic reports in org" ON public.historic_reports FOR SELECT TO authenticated USING (org_id=public.get_user_org_id() AND (public.has_role_in_org(auth.uid(),org_id,'admin') OR public.has_role_in_org(auth.uid(),org_id,'engineer')));
CREATE POLICY "Admins update historic reports in org" ON public.historic_reports FOR UPDATE TO authenticated USING (org_id=public.get_user_org_id() AND public.has_role_in_org(auth.uid(),org_id,'admin')) WITH CHECK (org_id=public.get_user_org_id() AND public.has_role_in_org(auth.uid(),org_id,'admin'));

-- Customer logos remain private, including legacy customer-id paths.
DROP POLICY IF EXISTS "Public read customer logos only" ON storage.objects;
CREATE OR REPLACE FUNCTION public.customer_logo_path_in_org(_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (split_part(_name,'/',1)=public.get_user_org_id()::text
 OR EXISTS(SELECT 1 FROM public.customers c WHERE c.id::text=split_part(_name,'/',1) AND c.org_id=public.get_user_org_id()));
$$;
CREATE OR REPLACE FUNCTION public.customer_logo_path_belongs_to_caller(_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.has_role_in_org(auth.uid(),public.get_user_org_id(),'admin') AND public.is_org_active(public.get_user_org_id()) AND (
 EXISTS(SELECT 1 FROM public.customers c WHERE c.id::text=split_part(_name,'/',1) AND c.org_id=public.get_user_org_id())
 OR (split_part(_name,'/',1)=public.get_user_org_id()::text AND (
 split_part(_name,'/',2)='print-logos' OR EXISTS(SELECT 1 FROM public.customers c WHERE c.id::text=split_part(_name,'/',2) AND c.org_id=public.get_user_org_id()))));
$$;
CREATE POLICY "Customer logo company read boundary" ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (bucket_id<>'customer-logos' OR public.customer_logo_path_in_org(name));
CREATE POLICY "No anonymous customer logo reads" ON storage.objects AS RESTRICTIVE FOR SELECT TO anon USING (bucket_id<>'customer-logos');
REVOKE ALL ON FUNCTION public.customer_logo_path_in_org(text), public.customer_logo_path_belongs_to_caller(text), public.guard_feature_org_references() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_logo_path_in_org(text), public.customer_logo_path_belongs_to_caller(text) TO authenticated, service_role;

-- Harden the existing transactional routines without changing their workflows.
DO $patch$
DECLARE d text;
BEGIN
 d:=pg_get_functiondef('public.merge_sites(jsonb)'::regprocedure);
 d:=replace(d,'WHERE site_id = $2 RETURNING id','WHERE site_id = $2 AND org_id = $3 RETURNING id');
 d:=replace(d,'INTO ids USING v_keep, v_dup;','INTO ids USING v_keep, v_dup, v_org;');
 d:=replace(d,'WHERE guess_site_id = v_dup RETURNING id','WHERE guess_site_id = v_dup AND org_id = v_org RETURNING id');
 d:=replace(d,'WHERE h.site_id = v_dup','WHERE h.site_id = v_dup AND h.org_id = v_org');
 d:=replace(d,'WHERE x.site_id = v_keep','WHERE x.site_id = v_keep AND x.org_id = v_org');
 d:=replace(d,'WHERE c.site_id = v_dup','WHERE c.site_id = v_dup AND c.org_id = v_org');
 d:=replace(d,'WHERE parent_id = v_dup AND id <> v_keep','WHERE parent_id = v_dup AND org_id = v_org AND id <> v_keep');
 d:=replace(d,'WHERE id = v_keep','WHERE id = v_keep AND org_id = v_org');
 d:=replace(d,'WHERE id = v_dup','WHERE id = v_dup AND org_id = v_org');
 EXECUTE d;
 d:=pg_get_functiondef('public.undo_last_site_merge()'::regprocedure);
 d:=replace(d,'WHERE id = l.merged_site_id','WHERE id = l.merged_site_id AND org_id = v_org');
 d:=replace(d,'WHERE id IN (SELECT (x)::uuid','WHERE org_id = v_org AND id IN (SELECT (x)::uuid');
 d:=replace(d,'SET site_id = $1 WHERE id IN','SET site_id = $1 WHERE org_id = $3 AND id IN');
 -- The prior general replacement includes v_org inside dynamic SQL; use a parameter there.
 d:=replace(d,'SET site_id = $1 WHERE org_id = v_org','SET site_id = $1 WHERE org_id = $3');
 d:=replace(d,'USING l.merged_site_id, l.moved->t;','USING l.merged_site_id, l.moved->t, v_org;');
 d:=replace(d,'SELECT * FROM jsonb_populate_recordset(NULL::public.customer_sites, l.removed_links)','SELECT r.* FROM jsonb_populate_recordset(NULL::public.customer_sites, l.removed_links) r WHERE r.org_id = v_org AND EXISTS(SELECT 1 FROM public.customers c WHERE c.id=r.customer_id AND c.org_id=v_org)');
 d:=replace(d,'WHERE id = l.kept_site_id','WHERE id = l.kept_site_id AND org_id = v_org');
 d:=replace(d,'WHERE id = l.id','WHERE id = l.id AND org_id = v_org');
 EXECUTE d;
 d:=pg_get_functiondef('public.site_data_stats()'::regprocedure);
 d:=replace(d,'WHERE NOT public.is_customer_user(auth.uid())','WHERE public.has_role_in_org(auth.uid(),public.get_user_org_id(),''admin'') OR public.has_role_in_org(auth.uid(),public.get_user_org_id(),''engineer'')');
 d:=replace(d,'WHERE parent_id IN','WHERE org_id=public.get_user_org_id() AND parent_id IN');
 d:=replace(d,'WHERE site_id IN','WHERE org_id=public.get_user_org_id() AND site_id IN');
 EXECUTE d;
 d:=pg_get_functiondef('public.sync_asset_from_job_sheet(uuid)'::regprocedure);
 d:=replace(d,'IF NOT FOUND OR r.status <> ''submitted'' THEN RETURN; END IF;', 'IF NOT FOUND OR r.status <> ''submitted'' THEN RETURN; END IF; IF auth.uid() IS NOT NULL AND r.org_id IS DISTINCT FROM public.get_user_org_id() THEN RAISE EXCEPTION ''Report belongs to another organisation''; END IF;');
 d:=replace(d,'WHERE id = r.job_id;', 'WHERE id = r.job_id AND org_id = r.org_id;');
 d:=replace(d,'IF NOT FOUND OR j.site_id IS NULL THEN RETURN; END IF;', 'IF NOT FOUND OR j.site_id IS NULL THEN RETURN; END IF; IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=j.site_id AND org_id=j.org_id) THEN RAISE EXCEPTION ''Report site belongs to another organisation''; END IF;');
 EXECUTE d;
 d:=pg_get_functiondef('public.lookup_asset_by_tag(text)'::regprocedure);
 d:=replace(d,'s.id = a.site_id','s.id = a.site_id AND s.org_id = a.org_id');
 d:=replace(d,'d.asset_id = a.id','d.asset_id = a.id AND d.org_id = a.org_id');
 d:=replace(d,'j.site_id = a.site_id','j.site_id = a.site_id AND j.org_id = a.org_id');
 d:=replace(d,'cs.site_id = a.site_id','cs.site_id = a.site_id AND cs.org_id = a.org_id');
 d:=replace(d,'c.id = cx.cid','c.id = cx.cid AND c.org_id = a.org_id');
 d:=replace(d,'AND NOT public.is_customer_user(auth.uid())','AND (public.has_role_in_org(auth.uid(),a.org_id,''admin'') OR public.has_role_in_org(auth.uid(),a.org_id,''engineer'')) AND NOT public.is_customer_user(auth.uid())');
 EXECUTE d;
END $patch$;
REVOKE ALL ON FUNCTION public.sync_asset_from_job_sheet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_asset_from_job_sheet(uuid) TO authenticated, service_role;