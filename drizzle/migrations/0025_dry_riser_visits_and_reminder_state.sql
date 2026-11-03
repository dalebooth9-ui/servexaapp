ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS no_longer_serviced boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS due_visit_state jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS no_longer_serviced boolean NOT NULL DEFAULT false;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS riser_visit_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS jobs_riser_visit_request_unique ON public.jobs(org_id,riser_visit_request_id) WHERE riser_visit_request_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.create_riser_visit(_site_id uuid,_engineer_id uuid,_date date,_risers jsonb,_notes text,_po text,_request_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_user_org_id(); s public.sites%ROWTYPE; c public.customers%ROWTYPE; a public.assets%ROWTYPE; t public.job_sheet_templates%ROWTYPE; j public.jobs%ROWTYPE; item jsonb; f jsonb; answers jsonb; ctx jsonb; v text; loc text; remedials text; p integer:=0; vis integer:=0; typ text; position integer:=0;
BEGIN
 IF o IS NULL OR NOT public.is_org_active(o) OR NOT public.has_role_in_org(auth.uid(),o,'admin') THEN RAISE EXCEPTION 'Office access required'; END IF;
 IF _request_id IS NULL OR _date IS NULL OR jsonb_typeof(_risers) IS DISTINCT FROM 'array' OR jsonb_array_length(_risers)=0 THEN RAISE EXCEPTION 'Choose risers, date and engineer'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(o::text||_request_id::text,0));
 SELECT * INTO j FROM public.jobs WHERE org_id=o AND riser_visit_request_id=_request_id; IF FOUND THEN RETURN j.id; END IF;
 SELECT * INTO s FROM public.sites WHERE id=_site_id AND org_id=o AND deleted_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'Site not found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=_engineer_id AND org_id=o) OR NOT public.has_role_in_org(_engineer_id,o,'engineer') THEN RAISE EXCEPTION 'Choose an engineer in your organisation'; END IF;
 SELECT cu.* INTO c FROM public.customers cu JOIN public.customer_sites cs ON cs.customer_id=cu.id WHERE cs.site_id=s.id AND cu.org_id=o ORDER BY cu.id LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Link this site to a customer first'; END IF;
 IF (SELECT count(DISTINCT x->>'asset_id') FROM jsonb_array_elements(_risers)x)<>jsonb_array_length(_risers) THEN RAISE EXCEPTION 'A riser can only be selected once'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(_risers) LOOP
  typ:=item->>'type'; IF typ NOT IN ('visual','pressure') OR typ IS NULL THEN RAISE EXCEPTION 'Choose a visit type for every riser'; END IF;
  SELECT * INTO a FROM public.assets WHERE id=(item->>'asset_id')::uuid AND site_id=s.id AND org_id=o AND asset_type='Dry Riser' AND status<>'decommissioned'; IF NOT FOUND THEN RAISE EXCEPTION 'Selected dry riser is not at this site'; END IF;
  IF typ='pressure' THEN p:=p+1; ELSE vis:=vis+1; END IF;
 END LOOP;
 INSERT INTO public.jobs(name,customer,customer_id,site_id,address,status,category,created_by,org_id,due_date,pressure_test_qty,visual_qty,detected_work_types,brief,customer_po,source,riser_visit_request_id)
 VALUES(s.name||' — Dry riser visit',c.name,c.id,s.id,s.address,'scheduled',CASE WHEN p>0 THEN 'dry_riser_pressure_test' ELSE 'dry_riser_visual' END,auth.uid(),o,_date,p,vis,CASE WHEN p>0 AND vis>0 THEN ARRAY['dry_riser_pressure_test','dry_riser_visual'] WHEN p>0 THEN ARRAY['dry_riser_pressure_test'] ELSE ARRAY['dry_riser_visual'] END,nullif(trim(_notes),''),nullif(trim(_po),''),'Riser visit',_request_id) RETURNING * INTO j;
 INSERT INTO public.job_assignments(job_id,engineer_id,org_id) VALUES(j.id,_engineer_id,o);
 INSERT INTO public.job_visits(job_id,engineer_id,scheduled_date,status,notes,org_id) VALUES(j.id,_engineer_id,_date,'upcoming',nullif(trim(_notes),''),o);
 INSERT INTO public.job_schedule(job_id,engineer_id,schedule_date,notes,created_by,org_id,sort_order) VALUES(j.id,_engineer_id,_date,nullif(trim(_notes),''),auth.uid(),o,0);
 FOR item IN SELECT * FROM jsonb_array_elements(_risers) LOOP
  position:=position+1; typ:=item->>'type';
  SELECT * INTO a FROM public.assets WHERE id=(item->>'asset_id')::uuid AND org_id=o;
  SELECT * INTO t FROM public.job_sheet_templates WHERE status='published' AND (org_id=o OR org_id IS NULL) AND job_category=CASE WHEN typ='pressure' THEN 'dry_riser_pressure_test' ELSE 'dry_riser_visual' END AND lower(name) NOT LIKE '%retired%' ORDER BY (org_id=o) DESC,updated_at DESC,id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No published % job sheet template available',typ; END IF;
  SELECT string_agg(d.title,E'\n' ORDER BY d.created_at) INTO remedials FROM public.defects d WHERE d.asset_id=a.id AND d.org_id=o AND d.status IN ('open','in_progress') AND (a.last_job_id IS NULL OR d.job_id=a.last_job_id OR d.job_id IS NULL);
  loc:=coalesce(nullif(a.riser_location,''),a.name,a.asset_tag);
  ctx:=jsonb_build_object('asset_id',a.id,'asset_tag',a.asset_tag,'riser_name',a.name,'riser_location',loc,'outlets_count',a.outlets_count,'last_inspection_at',a.last_inspection_at,'last_inspection_type',a.last_inspection_type,'last_inspection_result',a.last_inspection_result,'remedial_notes',coalesce(remedials,''),'customer',c.name,'site_name',s.name,'address',concat_ws(', ',s.address,s.postcode),'job_reference',j.reference_number,'planned_date',_date,'visit_type',typ,'order',position);
  answers:=jsonb_build_object('riser_asset_id',a.id,'riser_location',loc,'_riser_visit',ctx,'_system_label',loc);
  FOR f IN SELECT * FROM jsonb_array_elements(t.fields) LOOP
   v:=NULL;
   IF f->>'id'='riser_location' THEN v:=loc;
   ELSIF lower(f->>'label') LIKE '%outlet%' AND f->>'type'='number' THEN v:=a.outlets_count::text;
   ELSIF f->>'id'='customer_details' THEN v:=c.name;
   ELSIF f->>'id'='customer_name' THEN v:=NULL;
   ELSIF f->>'id'='site_details' THEN v:=concat_ws(E'\n',s.name,s.address,s.postcode);
   ELSIF f->>'id'='date' THEN v:=_date::text;
   ELSIF f->>'id'='po_number' THEN v:=coalesce(nullif(_po,''),j.reference_number);
   END IF;
   IF v IS NOT NULL THEN answers:=answers||jsonb_build_object(f->>'id',v); END IF;
  END LOOP;
  INSERT INTO public.job_sheet_responses(job_id,template_id,submitted_by,status,responses,system_label,org_id,created_at) VALUES(j.id,t.id,auth.uid(),'draft',answers,loc,o,now()+position*interval '1 millisecond');
 END LOOP;
 RETURN j.id;
END $$;
REVOKE ALL ON FUNCTION public.create_riser_visit(uuid,uuid,date,jsonb,text,text,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.create_riser_visit(uuid,uuid,date,jsonb,text,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.set_riser_reminder_state(_asset_id uuid,_state jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_user_org_id();
BEGIN
 IF o IS NULL OR NOT public.is_org_active(o) OR NOT public.has_role_in_org(auth.uid(),o,'admin') THEN RAISE EXCEPTION 'Office access required'; END IF;
 IF jsonb_typeof(_state) IS DISTINCT FROM 'object' OR (_state->>'status' IS NOT NULL AND _state->>'status' NOT IN ('snoozed','lost')) THEN RAISE EXCEPTION 'Invalid reminder state'; END IF;
 IF _state->>'status'='lost' AND nullif(trim(_state->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
 UPDATE public.assets SET due_visit_state=_state WHERE id=_asset_id AND org_id=o AND asset_type='Dry Riser'; IF NOT FOUND THEN RAISE EXCEPTION 'Riser not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_riser_reminder_state(uuid,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.set_riser_reminder_state(uuid,jsonb) TO authenticated;
COMMENT ON COLUMN public.assets.due_visit_state IS 'Office-only reminder lifecycle keyed to recorded inspection cycle. Reminders never book jobs.';