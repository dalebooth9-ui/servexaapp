CREATE OR REPLACE FUNCTION public.sprinkler_system_asset(_system_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.sprinkler_systems; t text; a uuid;
BEGIN
 SELECT * INTO s FROM public.sprinkler_systems WHERE id=_system_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF s.asset_id IS NOT NULL THEN RETURN s.asset_id; END IF;
 t:=public.generate_asset_tag(s.org_id);
 INSERT INTO public.assets(org_id,name,category,asset_type,site_id,asset_tag,status) VALUES(s.org_id,'Sprinkler control point','Sprinkler System','Sprinkler System',s.site_id,t,'operational') RETURNING id INTO a;
 UPDATE public.sprinkler_systems SET qr_tag=coalesce(qr_tag,t),asset_id=a,updated_at=now() WHERE id=s.id;
 RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.sprinkler_system_asset(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_sprinkler_report(_report_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.sprinkler_reports; s public.sprinkler_systems; j public.jobs; u record; res jsonb; p jsonb; k text; t text; aid uuid;
BEGIN
 SELECT * INTO r FROM public.sprinkler_reports WHERE id=_report_id FOR UPDATE;
 IF NOT FOUND OR r.org_id<>public.get_user_org_id() OR NOT public.can_act_on_job(r.job_id) THEN RAISE EXCEPTION 'You cannot submit this report'; END IF;
 IF r.status='submitted' THEN RETURN; END IF;
 SELECT * INTO s FROM public.sprinkler_systems WHERE id=r.system_id AND org_id=r.org_id FOR UPDATE;
 SELECT * INTO j FROM public.jobs WHERE id=r.job_id AND org_id=r.org_id;
 IF j.site_id IS DISTINCT FROM s.site_id THEN RAISE EXCEPTION 'Report system does not belong to this job site'; END IF;
 aid:=public.sprinkler_system_asset(s.id);
 FOR u IN SELECT * FROM public.sprinkler_units WHERE system_id=s.id LOOP
  res:=r.unit_results->(u.id::text);
  CONTINUE WHEN res IS NULL OR coalesce(res->>'result','')='';
  UPDATE public.sprinkler_units SET
   last_result=CASE WHEN res->>'result' IN ('ok','no_access','remedial') THEN res->>'result' ELSE last_result END,
   last_visited=CASE WHEN res->>'result' IN ('ok','remedial') THEN r.report_date ELSE last_visited END,
   head_count=CASE WHEN (res->>'heads') ~ '^[0-9]{1,4}$' THEN (res->>'heads')::int ELSE head_count END,
   revisit_pending=(res->>'result'='no_access'),
   revisit_visited_at=CASE WHEN res->>'result'='no_access' THEN NULL ELSE revisit_visited_at END
  WHERE id=u.id;
 END LOOP;
 IF r.visit_type='annual' THEN UPDATE public.sprinkler_systems SET last_annual=greatest(coalesce(last_annual,r.report_date),r.report_date),reminder_state='{}'::jsonb,updated_at=now() WHERE id=s.id;
 ELSE UPDATE public.sprinkler_systems SET last_six_month=greatest(coalesce(last_six_month,r.report_date),r.report_date),reminder_state='{}'::jsonb,updated_at=now() WHERE id=s.id; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.org_id::text||s.id::text,0));
 FOR p IN SELECT value FROM jsonb_array_elements(r.defects) LOOP
  k:=NULLIF(btrim(p->>'key'),''); t:=NULLIF(btrim(p->>'title'),'');
  CONTINUE WHEN k IS NULL OR t IS NULL OR coalesce((p->>'raise')::boolean,true)=false;
  IF NOT EXISTS(SELECT 1 FROM public.defects d WHERE d.org_id=r.org_id AND d.site_id=s.site_id AND (d.asset_id=aid OR d.category='sprinkler') AND d.status NOT IN ('resolved','closed','cancelled') AND (d.source_key='sprinkler:'||k OR lower(regexp_replace(d.title,'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(t,'[^a-zA-Z0-9]+','','g')))) THEN
   INSERT INTO public.defects(org_id,job_id,site_id,asset_id,reported_by,title,description,severity,status,category,location_on_site,source_key,source_kind,chargeable,bs_standard_reference)
   VALUES(r.org_id,r.job_id,s.site_id,aid,auth.uid(),left(t,200),NULLIF(p->>'description',''),CASE WHEN p->>'severity' IN ('low','medium','high','critical') THEN p->>'severity' ELSE 'medium' END,'open','sprinkler',NULLIF(p->>'location',''),'sprinkler:'||k,'job',true,NULLIF(p->>'clause',''));
  END IF;
 END LOOP;
 UPDATE public.sprinkler_reports SET status='submitted',submitted_at=now(),updated_at=now() WHERE id=r.id;
END $$;
REVOKE ALL ON FUNCTION public.submit_sprinkler_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_sprinkler_report(uuid) TO authenticated;