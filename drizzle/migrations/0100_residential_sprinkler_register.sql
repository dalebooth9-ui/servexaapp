CREATE TABLE public.sprinkler_systems(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL DEFAULT public.get_user_org_id(),
 site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
 asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
 qr_tag text,
 system_type text NOT NULL DEFAULT 'block' CHECK (system_type IN ('block','house','mist')),
 register jsonb NOT NULL DEFAULT '{}'::jsonb,
 zones jsonb NOT NULL DEFAULT '[]'::jsonb,
 last_annual date,
 last_six_month date,
 reminder_state jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(site_id)
);
CREATE INDEX sprinkler_systems_org_idx ON public.sprinkler_systems(org_id);
CREATE INDEX sprinkler_systems_tag_idx ON public.sprinkler_systems(org_id,qr_tag);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sprinkler_systems TO authenticated;
GRANT ALL ON public.sprinkler_systems TO service_role;
ALTER TABLE public.sprinkler_systems ENABLE ROW LEVEL SECURITY;
CREATE POLICY sprinkler_systems_read ON public.sprinkler_systems FOR SELECT TO authenticated USING (sprinkler_systems.org_id=public.get_user_org_id() AND NOT public.has_role(auth.uid(),'customer_user'));
CREATE POLICY sprinkler_systems_admin_ins ON public.sprinkler_systems FOR INSERT TO authenticated WITH CHECK (sprinkler_systems.org_id=public.get_user_org_id() AND public.has_role_in_org(auth.uid(),sprinkler_systems.org_id,'admin') AND EXISTS(SELECT 1 FROM public.sites s WHERE s.id=sprinkler_systems.site_id AND s.org_id=sprinkler_systems.org_id));
CREATE POLICY sprinkler_systems_admin_upd ON public.sprinkler_systems FOR UPDATE TO authenticated USING (sprinkler_systems.org_id=public.get_user_org_id() AND public.has_role_in_org(auth.uid(),sprinkler_systems.org_id,'admin')) WITH CHECK (sprinkler_systems.org_id=public.get_user_org_id() AND EXISTS(SELECT 1 FROM public.sites s WHERE s.id=sprinkler_systems.site_id AND s.org_id=sprinkler_systems.org_id));
CREATE POLICY sprinkler_systems_admin_del ON public.sprinkler_systems FOR DELETE TO authenticated USING (sprinkler_systems.org_id=public.get_user_org_id() AND public.has_role_in_org(auth.uid(),sprinkler_systems.org_id,'admin'));

CREATE TABLE public.sprinkler_units(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL DEFAULT public.get_user_org_id(),
 system_id uuid NOT NULL REFERENCES public.sprinkler_systems(id) ON DELETE CASCADE,
 label text NOT NULL,
 sort_order integer NOT NULL DEFAULT 0,
 head_count integer,
 access_notes text,
 last_result text CHECK (last_result IS NULL OR last_result IN ('ok','no_access','remedial')),
 last_visited date,
 revisit_pending boolean NOT NULL DEFAULT false,
 revisit_visited_at date,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(system_id,label)
);
CREATE INDEX sprinkler_units_system_idx ON public.sprinkler_units(system_id,sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sprinkler_units TO authenticated;
GRANT ALL ON public.sprinkler_units TO service_role;
ALTER TABLE public.sprinkler_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY sprinkler_units_read ON public.sprinkler_units FOR SELECT TO authenticated USING (sprinkler_units.org_id=public.get_user_org_id() AND NOT public.has_role(auth.uid(),'customer_user'));
CREATE POLICY sprinkler_units_admin_ins ON public.sprinkler_units FOR INSERT TO authenticated WITH CHECK (sprinkler_units.org_id=public.get_user_org_id() AND public.has_role_in_org(auth.uid(),sprinkler_units.org_id,'admin') AND EXISTS(SELECT 1 FROM public.sprinkler_systems s WHERE s.id=sprinkler_units.system_id AND s.org_id=sprinkler_units.org_id));
CREATE POLICY sprinkler_units_admin_upd ON public.sprinkler_units FOR UPDATE TO authenticated USING (sprinkler_units.org_id=public.get_user_org_id() AND public.has_role_in_org(auth.uid(),sprinkler_units.org_id,'admin')) WITH CHECK (sprinkler_units.org_id=public.get_user_org_id() AND EXISTS(SELECT 1 FROM public.sprinkler_systems s WHERE s.id=sprinkler_units.system_id AND s.org_id=sprinkler_units.org_id));
CREATE POLICY sprinkler_units_admin_del ON public.sprinkler_units FOR DELETE TO authenticated USING (sprinkler_units.org_id=public.get_user_org_id() AND public.has_role_in_org(auth.uid(),sprinkler_units.org_id,'admin'));

CREATE TABLE public.sprinkler_reports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL DEFAULT public.get_user_org_id(),
 job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
 system_id uuid NOT NULL REFERENCES public.sprinkler_systems(id) ON DELETE CASCADE,
 visit_type text NOT NULL DEFAULT 'annual' CHECK (visit_type IN ('annual','six_month','quarterly')),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
 report_date date NOT NULL DEFAULT current_date,
 answers jsonb NOT NULL DEFAULT '{}'::jsonb,
 unit_results jsonb NOT NULL DEFAULT '{}'::jsonb,
 defects jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_by uuid DEFAULT auth.uid(),
 submitted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(job_id,system_id)
);
CREATE INDEX sprinkler_reports_system_idx ON public.sprinkler_reports(system_id,report_date DESC);
GRANT SELECT, INSERT, UPDATE ON public.sprinkler_reports TO authenticated;
GRANT ALL ON public.sprinkler_reports TO service_role;
ALTER TABLE public.sprinkler_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY sprinkler_reports_read ON public.sprinkler_reports FOR SELECT TO authenticated USING (sprinkler_reports.org_id=public.get_user_org_id() AND NOT public.has_role(auth.uid(),'customer_user'));
CREATE POLICY sprinkler_reports_ins ON public.sprinkler_reports FOR INSERT TO authenticated WITH CHECK (sprinkler_reports.org_id=public.get_user_org_id() AND sprinkler_reports.status='draft' AND public.can_act_on_job(sprinkler_reports.job_id) AND EXISTS(SELECT 1 FROM public.sprinkler_systems s JOIN public.jobs j ON j.site_id=s.site_id WHERE s.id=sprinkler_reports.system_id AND j.id=sprinkler_reports.job_id AND s.org_id=sprinkler_reports.org_id));
CREATE POLICY sprinkler_reports_upd ON public.sprinkler_reports FOR UPDATE TO authenticated USING (sprinkler_reports.org_id=public.get_user_org_id() AND public.can_act_on_job(sprinkler_reports.job_id) AND sprinkler_reports.status='draft') WITH CHECK (sprinkler_reports.org_id=public.get_user_org_id() AND sprinkler_reports.status='draft');

CREATE OR REPLACE FUNCTION public.ensure_sprinkler_qr(_system_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.sprinkler_systems; t text; a uuid;
BEGIN
 SELECT * INTO s FROM public.sprinkler_systems WHERE id=_system_id FOR UPDATE;
 IF NOT FOUND OR s.org_id<>public.get_user_org_id() OR NOT public.has_role_in_org(auth.uid(),s.org_id,'admin') THEN RAISE EXCEPTION 'Only your company office can create this label'; END IF;
 IF s.qr_tag IS NOT NULL THEN RETURN s.qr_tag; END IF;
 t:=public.generate_asset_tag(s.org_id);
 INSERT INTO public.assets(org_id,name,category,asset_type,site_id,asset_tag,status) VALUES(s.org_id,'Sprinkler control point','Sprinkler System','Sprinkler System',s.site_id,t,'operational') RETURNING id INTO a;
 UPDATE public.sprinkler_systems SET qr_tag=t,asset_id=a,updated_at=now() WHERE id=s.id;
 RETURN t;
END $$;
REVOKE ALL ON FUNCTION public.ensure_sprinkler_qr(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_sprinkler_qr(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_sprinkler_unit_visited(_unit_id uuid, _date date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u public.sprinkler_units;
BEGIN
 SELECT * INTO u FROM public.sprinkler_units WHERE id=_unit_id FOR UPDATE;
 IF NOT FOUND OR u.org_id<>public.get_user_org_id() OR NOT (public.has_role_in_org(auth.uid(),u.org_id,'admin') OR public.has_role_in_org(auth.uid(),u.org_id,'engineer')) THEN RAISE EXCEPTION 'You cannot update this flat'; END IF;
 UPDATE public.sprinkler_units SET revisit_pending=false,revisit_visited_at=coalesce(_date,current_date),last_visited=coalesce(_date,current_date),last_result=CASE WHEN last_result='no_access' THEN 'ok' ELSE last_result END WHERE id=u.id;
END $$;
REVOKE ALL ON FUNCTION public.mark_sprinkler_unit_visited(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_sprinkler_unit_visited(uuid,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_sprinkler_report(_report_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.sprinkler_reports; s public.sprinkler_systems; j public.jobs; u record; res jsonb; p jsonb; k text; t text;
BEGIN
 SELECT * INTO r FROM public.sprinkler_reports WHERE id=_report_id FOR UPDATE;
 IF NOT FOUND OR r.org_id<>public.get_user_org_id() OR NOT public.can_act_on_job(r.job_id) THEN RAISE EXCEPTION 'You cannot submit this report'; END IF;
 IF r.status='submitted' THEN RETURN; END IF;
 SELECT * INTO s FROM public.sprinkler_systems WHERE id=r.system_id AND org_id=r.org_id FOR UPDATE;
 SELECT * INTO j FROM public.jobs WHERE id=r.job_id AND org_id=r.org_id;
 IF j.site_id IS DISTINCT FROM s.site_id THEN RAISE EXCEPTION 'Report system does not belong to this job site'; END IF;
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
  IF NOT EXISTS(SELECT 1 FROM public.defects d WHERE d.org_id=r.org_id AND d.site_id=s.site_id AND d.asset_id IS NOT DISTINCT FROM s.asset_id AND d.status NOT IN ('resolved','closed','cancelled') AND (d.source_key='sprinkler:'||k OR lower(regexp_replace(d.title,'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(t,'[^a-zA-Z0-9]+','','g')))) THEN
   INSERT INTO public.defects(org_id,job_id,site_id,asset_id,reported_by,title,description,severity,status,category,location_on_site,source_key,source_kind,chargeable,bs_standard_reference)
   VALUES(r.org_id,r.job_id,s.site_id,s.asset_id,auth.uid(),left(t,200),NULLIF(p->>'description',''),CASE WHEN p->>'severity' IN ('low','medium','high','critical') THEN p->>'severity' ELSE 'medium' END,'open','sprinkler',NULLIF(p->>'location',''),'sprinkler:'||k,'job',true,NULLIF(p->>'clause',''));
  END IF;
 END LOOP;
 UPDATE public.sprinkler_reports SET status='submitted',submitted_at=now(),updated_at=now() WHERE id=r.id;
END $$;
REVOKE ALL ON FUNCTION public.submit_sprinkler_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_sprinkler_report(uuid) TO authenticated;