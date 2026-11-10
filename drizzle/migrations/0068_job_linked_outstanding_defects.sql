ALTER TABLE public.defects ADD COLUMN IF NOT EXISTS scheduled_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.defects.scheduled_asset_id IS 'Target job riser; null is a general job item. Original asset_id is preserved.';
CREATE OR REPLACE FUNCTION public.defect_customer(p_defect uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(j.customer_id, (SELECT cs.customer_id FROM public.customer_sites cs WHERE cs.site_id=coalesce(d.site_id,a.site_id) AND cs.org_id=d.org_id ORDER BY cs.customer_id LIMIT 1)) FROM public.defects d LEFT JOIN public.jobs j ON j.id=d.job_id AND j.org_id=d.org_id LEFT JOIN public.assets a ON a.id=d.asset_id AND a.org_id=d.org_id WHERE d.id=p_defect AND d.org_id=public.get_user_org_id()
$$;
REVOKE ALL ON FUNCTION public.defect_customer(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.defect_job_candidates(p_defect uuid) RETURNS TABLE(id uuid, reference_number text, site_name text, visit_date date, same_site boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT j.id,j.reference_number,s.name,v.scheduled_date,j.site_id=coalesce(d.site_id,a.site_id) FROM public.defects d LEFT JOIN public.assets a ON a.id=d.asset_id AND a.org_id=d.org_id JOIN public.jobs j ON j.org_id=d.org_id LEFT JOIN public.sites s ON s.id=j.site_id LEFT JOIN LATERAL (SELECT scheduled_date FROM public.job_visits WHERE job_id=j.id AND org_id=j.org_id AND scheduled_date >= (now() AT TIME ZONE 'Europe/London')::date AND coalesce(status,'scheduled') NOT IN ('completed','cancelled') ORDER BY scheduled_date,scheduled_time LIMIT 1) v ON true
 WHERE d.id=p_defect AND d.org_id=public.get_user_org_id() AND public.has_role(auth.uid(),'admin') AND j.status NOT IN ('completed','cancelled','invoiced','archived','rejected') AND (public.defect_customer(d.id) IS NULL OR j.customer_id=public.defect_customer(d.id)) ORDER BY (j.site_id=coalesce(d.site_id,a.site_id)) DESC NULLS LAST,v.scheduled_date NULLS LAST,j.reference_number
$$;
REVOKE ALL ON FUNCTION public.defect_job_candidates(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.defect_job_candidates(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.outstanding_defects_for_job(p_job uuid) RETURNS SETOF public.defects LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT d.* FROM public.jobs j JOIN public.defects d ON d.org_id=j.org_id LEFT JOIN public.assets a ON a.id=d.asset_id AND a.org_id=d.org_id WHERE j.id=p_job AND j.org_id=public.get_user_org_id() AND public.has_role(auth.uid(),'admin') AND d.status NOT IN ('resolved','declined') AND (coalesce(d.site_id,a.site_id)=j.site_id OR (j.customer_id IS NOT NULL AND public.defect_customer(d.id)=j.customer_id) OR d.scheduled_job_id=j.id) ORDER BY (coalesce(d.site_id,a.site_id)=j.site_id) DESC NULLS LAST,d.created_at
$$;
REVOKE ALL ON FUNCTION public.outstanding_defects_for_job(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.outstanding_defects_for_job(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.attach_defects_to_job(p_defect_ids uuid[],p_job uuid DEFAULT NULL) RETURNS TABLE(defect_id uuid,outcome text,job_id uuid,job_ref text,site_name text,visit_date date,report_name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_user_org_id(); did uuid; d public.defects%ROWTYPE; j public.jobs%ROWTYPE; v public.job_visits%ROWTYPE; ds uuid; dc uuid; target uuid; riser_match text;
BEGIN
 IF o IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only office staff can add outstanding defects'; END IF;
 FOREACH did IN ARRAY p_defect_ids LOOP
  defect_id:=did; outcome:=NULL; job_id:=NULL; job_ref:=NULL; site_name:=NULL; visit_date:=NULL; report_name:=NULL;
  SELECT * INTO d FROM public.defects WHERE id=did AND org_id=o FOR UPDATE;
  IF d.id IS NULL THEN outcome:='not_found'; RETURN NEXT; CONTINUE; END IF;
  IF d.status IN ('resolved','declined') THEN outcome:='closed'; RETURN NEXT; CONTINUE; END IF;
  ds:=coalesce(d.site_id,(SELECT site_id FROM public.assets WHERE id=d.asset_id AND org_id=o)); dc:=public.defect_customer(d.id);
  IF p_job IS NULL THEN
   IF ds IS NULL THEN outcome:='no_site'; RETURN NEXT; CONTINUE; END IF;
   SELECT jj.* INTO j FROM public.jobs jj JOIN public.job_visits vv ON vv.job_id=jj.id AND vv.org_id=o WHERE jj.org_id=o AND jj.site_id=ds AND (dc IS NULL OR jj.customer_id=dc) AND jj.status NOT IN ('completed','cancelled','invoiced','archived','rejected') AND vv.scheduled_date >= (now() AT TIME ZONE 'Europe/London')::date AND coalesce(vv.status,'scheduled') NOT IN ('completed','cancelled') ORDER BY vv.scheduled_date,vv.scheduled_time NULLS LAST,jj.id LIMIT 1;
   IF j.id IS NULL THEN outcome:=CASE WHEN EXISTS(SELECT 1 FROM public.jobs WHERE org_id=o AND site_id=ds AND (dc IS NULL OR customer_id=dc) AND status NOT IN ('completed','cancelled','invoiced','archived','rejected')) THEN 'no_visit' ELSE 'site_mismatch' END; RETURN NEXT; CONTINUE; END IF;
  ELSE
   SELECT * INTO j FROM public.jobs WHERE id=p_job AND org_id=o AND status NOT IN ('completed','cancelled','invoiced','archived','rejected');
   IF j.id IS NULL THEN outcome:='job_unavailable'; RETURN NEXT; CONTINUE; END IF;
   IF dc IS NOT NULL AND j.customer_id IS DISTINCT FROM dc THEN outcome:='customer_mismatch'; RETURN NEXT; CONTINUE; END IF;
  END IF;
  SELECT * INTO v FROM public.job_visits WHERE job_visits.job_id=j.id AND org_id=o AND scheduled_date >= (now() AT TIME ZONE 'Europe/London')::date AND coalesce(status,'scheduled') NOT IN ('completed','cancelled') ORDER BY scheduled_date,scheduled_time NULLS LAST LIMIT 1;
  target:=NULL;
  IF EXISTS(SELECT 1 FROM public.job_risers r WHERE r.job_id=j.id AND r.asset_id=d.asset_id AND r.org_id=o) OR j.asset_id=d.asset_id THEN target:=d.asset_id; END IF;
  IF target IS NULL THEN
   riser_match:=substring(concat_ws(' ',d.location_on_site,d.title,d.description) from '(?i)riser\s*#?\s*([0-9]+)');
   IF riser_match IS NOT NULL THEN
    SELECT CASE WHEN count(*)=1 THEN (array_agg(a.id))[1] ELSE NULL END INTO target FROM public.assets a WHERE a.org_id=o AND (a.id=j.asset_id OR EXISTS(SELECT 1 FROM public.job_risers r WHERE r.job_id=j.id AND r.asset_id=a.id AND r.org_id=o)) AND substring(concat_ws(' ',a.riser_location,a.name) from '(?i)riser\s*#?\s*([0-9]+)')=riser_match;
   END IF;
  END IF;
  UPDATE public.defects SET scheduled_job_id=j.id,scheduled_visit_id=v.id,scheduled_asset_id=target,status='scheduled',carry_outcome=NULL,carry_comment=NULL,carry_recorded_at=NULL,carry_recorded_by=NULL,updated_at=now() WHERE id=d.id AND org_id=o;
  outcome:='scheduled'; job_id:=j.id; job_ref:=j.reference_number; SELECT name INTO site_name FROM public.sites WHERE id=j.site_id AND org_id=o; visit_date:=v.scheduled_date;
  SELECT string_agg(DISTINCT t.name,', ') INTO report_name FROM public.job_sheet_responses r JOIN public.job_sheet_templates t ON t.id=r.template_id WHERE r.job_id=j.id AND r.org_id=o AND r.status<>'not_used';
  report_name:=coalesce(report_name,'Service report'); RETURN NEXT;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.attach_defects_to_job(uuid[],uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.attach_defects_to_job(uuid[],uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.schedule_defects_on_next_visit(p_defect_ids uuid[]) RETURNS TABLE(defect_id uuid,outcome text,visit_id uuid,job_id uuid,visit_date date,job_ref text) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT r.defect_id,r.outcome,d.scheduled_visit_id,r.job_id,r.visit_date,r.job_ref FROM public.attach_defects_to_job(p_defect_ids,NULL) r LEFT JOIN public.defects d ON d.id=r.defect_id $$;
CREATE OR REPLACE FUNCTION public.job_carried_remedials(p_job uuid) RETURNS TABLE(id uuid,title text,asset_id uuid,riser text,works_required text,materials_required text,visit_date date,carry_outcome text,carry_comment text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT d.id,d.title,CASE WHEN EXISTS(SELECT 1 FROM public.job_risers r WHERE r.job_id=p_job AND r.asset_id=coalesce(d.scheduled_asset_id,d.asset_id) AND r.org_id=d.org_id) OR j.asset_id=coalesce(d.scheduled_asset_id,d.asset_id) THEN coalesce(d.scheduled_asset_id,d.asset_id) ELSE NULL END,coalesce(a.riser_location,a.name),d.works_required,d.materials_required,v.scheduled_date,d.carry_outcome,d.carry_comment FROM public.defects d JOIN public.jobs j ON j.id=p_job AND j.org_id=d.org_id LEFT JOIN public.assets a ON a.id=d.scheduled_asset_id AND a.org_id=d.org_id LEFT JOIN public.job_visits v ON v.id=d.scheduled_visit_id AND v.org_id=d.org_id WHERE d.scheduled_job_id=p_job AND d.org_id=public.get_user_org_id() AND public.can_act_on_job(p_job) ORDER BY a.riser_location NULLS LAST,d.created_at
$$;