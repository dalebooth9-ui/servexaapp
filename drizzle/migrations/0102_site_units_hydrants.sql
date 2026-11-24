CREATE TABLE public.site_units(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL DEFAULT public.get_user_org_id(),
 site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
 unit_kind text NOT NULL CHECK (unit_kind IN ('hydrant','fire_door','emergency_light','aov')),
 unit_number integer NOT NULL CHECK (unit_number > 0),
 location text,
 unit_type text,
 last_reading numeric,
 last_reading_unit text,
 last_result text,
 last_inspected date,
 access_notes text,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(site_id,unit_kind,unit_number)
);
CREATE INDEX site_units_org_site_idx ON public.site_units(org_id,site_id,unit_kind);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_units TO authenticated;
GRANT ALL ON public.site_units TO service_role;
ALTER TABLE public.site_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_units_read ON public.site_units FOR SELECT TO authenticated USING (site_units.org_id=public.get_user_org_id() AND NOT public.has_role(auth.uid(),'customer_user'));
CREATE POLICY site_units_admin_ins ON public.site_units FOR INSERT TO authenticated WITH CHECK (site_units.org_id=public.get_user_org_id() AND public.has_role_in_org(auth.uid(),site_units.org_id,'admin') AND EXISTS(SELECT 1 FROM public.sites s WHERE s.id=site_units.site_id AND s.org_id=site_units.org_id));
CREATE POLICY site_units_admin_upd ON public.site_units FOR UPDATE TO authenticated USING (site_units.org_id=public.get_user_org_id() AND public.has_role_in_org(auth.uid(),site_units.org_id,'admin')) WITH CHECK (site_units.org_id=public.get_user_org_id() AND EXISTS(SELECT 1 FROM public.sites s WHERE s.id=site_units.site_id AND s.org_id=site_units.org_id));
CREATE POLICY site_units_admin_del ON public.site_units FOR DELETE TO authenticated USING (site_units.org_id=public.get_user_org_id() AND public.has_role_in_org(auth.uid(),site_units.org_id,'admin'));

ALTER TABLE public.defects ADD COLUMN site_unit_id uuid REFERENCES public.site_units(id) ON DELETE SET NULL;
CREATE INDEX defects_site_unit_idx ON public.defects(site_unit_id) WHERE site_unit_id IS NOT NULL;

-- Office: find-or-create a unit by site + kind + number (paper review, job sheets).
CREATE OR REPLACE FUNCTION public.ensure_site_unit(_site_id uuid,_kind text,_number integer,_location text DEFAULT NULL,_type text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_user_org_id(); r uuid;
BEGIN
 IF auth.uid() IS NULL OR o IS NULL OR NOT public.has_role_in_org(auth.uid(),o,'admin') THEN RAISE EXCEPTION 'Only the company office can add units'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=_site_id AND org_id=o AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Site not found in your company'; END IF;
 IF _number IS NULL OR _number<1 THEN RAISE EXCEPTION 'Enter a unit number of 1 or more'; END IF;
 INSERT INTO public.site_units(org_id,site_id,unit_kind,unit_number,location,unit_type) VALUES(o,_site_id,_kind,_number,NULLIF(btrim(_location),''),NULLIF(btrim(_type),''))
 ON CONFLICT(site_id,unit_kind,unit_number) DO UPDATE SET location=coalesce(public.site_units.location,EXCLUDED.location),unit_type=coalesce(public.site_units.unit_type,EXCLUDED.unit_type),updated_at=now()
 RETURNING id INTO r;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.ensure_site_unit(uuid,text,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ensure_site_unit(uuid,text,integer,text,text) TO authenticated,service_role;

-- Office: bulk-add units n..m (existing numbers are left alone).
CREATE OR REPLACE FUNCTION public.bulk_add_site_units(_site_id uuid,_kind text,_from integer,_to integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_user_org_id(); n integer;
BEGIN
 IF auth.uid() IS NULL OR o IS NULL OR NOT public.has_role_in_org(auth.uid(),o,'admin') THEN RAISE EXCEPTION 'Only the company office can add units'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=_site_id AND org_id=o AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Site not found in your company'; END IF;
 IF _from IS NULL OR _to IS NULL OR _from<1 OR _to<_from OR _to-_from>499 THEN RAISE EXCEPTION 'Enter a range like 1 to 10 (up to 500 at a time)'; END IF;
 INSERT INTO public.site_units(org_id,site_id,unit_kind,unit_number) SELECT o,_site_id,_kind,g FROM generate_series(_from,_to) g ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.bulk_add_site_units(uuid,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bulk_add_site_units(uuid,text,integer,integer) TO authenticated,service_role;

-- Paper review defects: also link to the sheet's unit (_site_unit_id) and dedupe per unit.
CREATE OR REPLACE FUNCTION public.raise_paper_review_defects() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE j public.jobs; p jsonb; a uuid; su uuid; k text; t text; BEGIN IF NEW.status <> 'submitted' OR NOT (NEW.responses ? '_paper_review_defects') THEN RETURN NEW; END IF; SELECT * INTO j FROM public.jobs WHERE id=NEW.job_id AND org_id=NEW.org_id; IF NOT FOUND OR NOT j.historic_backfill THEN RAISE EXCEPTION 'Paper defects require a completed paper-scan job'; END IF; IF auth.uid() IS NULL OR NOT public.has_role_in_org(auth.uid(),NEW.org_id,'admin') THEN RAISE EXCEPTION 'Only the company office can confirm paper defects'; END IF; a:=NULLIF(NEW.responses->>'riser_asset_id','')::uuid; IF a IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.assets WHERE id=a AND org_id=NEW.org_id AND site_id=j.site_id) THEN RAISE EXCEPTION 'Selected asset does not belong to this site'; END IF; su:=NULLIF(NEW.responses->>'_site_unit_id','')::uuid; IF su IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.site_units WHERE id=su AND org_id=NEW.org_id AND site_id=j.site_id) THEN RAISE EXCEPTION 'Selected unit does not belong to this site'; END IF; PERFORM pg_advisory_xact_lock(hashtextextended(NEW.org_id::text||coalesce(su::text,a::text,j.site_id::text,j.id::text),0)); FOR p IN SELECT value FROM jsonb_array_elements(NEW.responses->'_paper_review_defects') LOOP k:=NULLIF(btrim(p->>'key'),''); t:=NULLIF(btrim(p->>'title'),''); CONTINUE WHEN k IS NULL OR t IS NULL; IF NOT EXISTS(SELECT 1 FROM public.defects d WHERE d.org_id=NEW.org_id AND d.site_id IS NOT DISTINCT FROM j.site_id AND d.asset_id IS NOT DISTINCT FROM a AND d.site_unit_id IS NOT DISTINCT FROM su AND d.status NOT IN ('resolved','closed','cancelled') AND ((d.source_response_id=NEW.id AND d.source_key='paper:'||k) OR ((a IS NOT NULL OR su IS NOT NULL) AND (d.source_key IN ('paper:'||k,'check:'||replace(k,'field:',''),'suggest:'||k) OR lower(regexp_replace(d.title,'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(t,'[^a-zA-Z0-9]+','','g')) OR (p->>'source_field_label' IS NOT NULL AND lower(regexp_replace(d.title,'^(Failed check: )','','i'))=lower(p->>'source_field_label')))))) THEN INSERT INTO public.defects(org_id,job_id,site_id,asset_id,site_unit_id,reported_by,title,description,severity,status,category,location_on_site,source_response_id,source_key,source_kind,chargeable) VALUES(NEW.org_id,j.id,j.site_id,a,su,auth.uid(),left(t,200),p->>'description',CASE WHEN p->>'severity' IN ('low','medium','high','critical') THEN p->>'severity' ELSE 'medium' END,'open',coalesce(p->>'category','other'),NULLIF(p->>'location_on_site',''),NEW.id,'paper:'||k,'job',true) ON CONFLICT (source_response_id,source_key) WHERE source_response_id IS NOT NULL AND source_key IS NOT NULL DO NOTHING; END IF; END LOOP; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.raise_paper_review_defects() FROM PUBLIC,anon,authenticated;

-- Any submitted sheet linked to a unit updates that unit's last values (newest inspection wins).
CREATE OR REPLACE FUNCTION public.sync_site_unit_from_response() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE su uuid; r jsonb; d date; j public.jobs;
BEGIN
 IF NEW.status <> 'submitted' OR NOT (NEW.responses ? '_site_unit_id') THEN RETURN NEW; END IF;
 su:=NULLIF(NEW.responses->>'_site_unit_id','')::uuid; IF su IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO j FROM public.jobs WHERE id=NEW.job_id AND org_id=NEW.org_id;
 IF NOT EXISTS(SELECT 1 FROM public.site_units WHERE id=su AND org_id=NEW.org_id AND site_id IS NOT DISTINCT FROM j.site_id) THEN RAISE EXCEPTION 'Selected unit does not belong to this job''s site'; END IF;
 r:=coalesce(NEW.responses->'_site_unit_result','{}'::jsonb);
 d:=coalesce(NULLIF(r->>'inspected','')::date,(coalesce(NEW.submitted_at,now()) AT TIME ZONE 'Europe/London')::date);
 UPDATE public.site_units SET
   last_inspected=d,
   last_reading=CASE WHEN r->>'reading' ~ '^\d+(\.\d+)?$' THEN (r->>'reading')::numeric ELSE last_reading END,
   last_reading_unit=coalesce(NULLIF(r->>'reading_unit',''),last_reading_unit),
   last_result=coalesce(NULLIF(r->>'result',''),last_result),
   location=coalesce(NULLIF(btrim(r->>'location'),''),location),
   unit_type=coalesce(NULLIF(btrim(r->>'type'),''),unit_type),
   access_notes=coalesce(access_notes,NULLIF(btrim(r->>'access_notes'),'')),
   updated_at=now()
 WHERE id=su AND (last_inspected IS NULL OR last_inspected<=d);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_site_unit_from_response() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_site_unit_from_response AFTER INSERT OR UPDATE OF status,responses ON public.job_sheet_responses FOR EACH ROW EXECUTE FUNCTION public.sync_site_unit_from_response();