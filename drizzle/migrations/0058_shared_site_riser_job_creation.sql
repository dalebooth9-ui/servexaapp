CREATE OR REPLACE FUNCTION public.create_site_riser_job(_site_id uuid, _request_id uuid, _details jsonb, _riser_ids uuid[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_user_org_id(); s public.sites%ROWTYPE; c public.customers%ROWTYPE; a public.assets%ROWTYPE; t public.job_sheet_templates%ROWTYPE; j public.jobs%ROWTYPE; typ text:=_details->>'type'; cat text; n integer; pos integer:=0; answers jsonb; ctx jsonb; loc text; due date; template_id uuid;
BEGIN
 IF o IS NULL OR NOT public.is_org_active(o) OR NOT public.has_role_in_org(auth.uid(),o,'admin') THEN RAISE EXCEPTION 'Office access required'; END IF;
 IF _request_id IS NULL OR nullif(trim(_details->>'name'),'') IS NULL OR typ IS NULL OR typ NOT IN ('visual','pressure','other') THEN RAISE EXCEPTION 'Choose a job name and job type'; END IF;
 IF coalesce(_details->>'priority','medium') NOT IN ('low','medium','high') THEN RAISE EXCEPTION 'Invalid priority'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(o::text||_request_id::text,0));
 SELECT * INTO j FROM public.jobs WHERE org_id=o AND riser_visit_request_id=_request_id; IF FOUND THEN RETURN j.id; END IF;
 SELECT * INTO s FROM public.sites WHERE id=_site_id AND org_id=o AND deleted_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'Site not found'; END IF;
 IF nullif(_details->>'customer_id','') IS NOT NULL THEN SELECT * INTO c FROM public.customers WHERE id=(_details->>'customer_id')::uuid AND org_id=o; IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found in this company'; END IF; END IF;
 n:=coalesce(cardinality(_riser_ids),0);
 IF n<>(SELECT count(DISTINCT id) FROM unnest(_riser_ids) id) THEN RAISE EXCEPTION 'A riser can only be selected once'; END IF;
 IF n<>(SELECT count(*) FROM public.assets WHERE id=ANY(_riser_ids) AND site_id=s.id AND org_id=o AND merged_into_asset_id IS NULL AND status<>'decommissioned' AND asset_type IN ('Dry Riser','Wet Riser')) THEN RAISE EXCEPTION 'Selected riser is not active at this site'; END IF;
 IF typ<>'other' AND n=0 THEN RAISE EXCEPTION 'Tick at least one riser'; END IF;
 cat:=CASE typ WHEN 'visual' THEN 'dry_riser_visual' WHEN 'pressure' THEN 'dry_riser_pressure_test' ELSE 'other' END;
 due:=nullif(_details->>'due_date','')::date;
 IF typ='other' AND (nullif(trim(_details->>'other_service_type'),'') IS NULL OR coalesce((_details->>'other_qty')::integer,0)<1) THEN RAISE EXCEPTION 'Enter the other service type and quantity'; END IF;
 SELECT print_template_id INTO template_id FROM public.job_categories WHERE org_id=o AND slug=cat ORDER BY id LIMIT 1;
 SELECT * INTO t FROM public.job_sheet_templates WHERE (org_id=o OR org_id IS NULL) AND status='published' AND (id=template_id OR job_category=cat) ORDER BY (id=template_id) DESC NULLS LAST,(org_id=o) DESC,created_at,id LIMIT 1;
 IF typ<>'other' AND t.id IS NULL THEN RAISE EXCEPTION 'No published job sheet for this job type. Choose its template in Settings first'; END IF;
 INSERT INTO public.jobs(name,reference_number,priority,customer,customer_id,site_id,address,status,category,created_by,org_id,due_date,pressure_test_qty,visual_qty,other_qty,other_service_type,detected_work_types,brief,customer_po,source,riser_visit_request_id)
 VALUES(trim(_details->>'name'),nullif(trim(_details->>'reference_number'),''),coalesce(_details->>'priority','medium'),c.name,c.id,s.id,s.address,'active',cat,auth.uid(),o,due,CASE WHEN typ='pressure' THEN n ELSE 0 END,CASE WHEN typ='visual' THEN n ELSE 0 END,CASE WHEN typ='other' THEN (_details->>'other_qty')::integer ELSE 0 END,CASE WHEN typ='other' THEN trim(_details->>'other_service_type') ELSE NULL END,ARRAY[cat],nullif(trim(_details->>'notes'),''),nullif(trim(_details->>'po'),''),'Riser visit',_request_id) RETURNING * INTO j;
 INSERT INTO public.job_risers(org_id,job_id,asset_id,selected) SELECT o,j.id,id,id=ANY(coalesce(_riser_ids,ARRAY[]::uuid[])) FROM public.assets WHERE org_id=o AND site_id=s.id AND merged_into_asset_id IS NULL AND status<>'decommissioned' AND asset_type IN ('Dry Riser','Wet Riser');
 IF t.id IS NOT NULL THEN
 FOR a IN SELECT * FROM public.assets WHERE org_id=o AND id=ANY(_riser_ids) ORDER BY riser_location,id LOOP
 pos:=pos+1; loc:=coalesce(nullif(a.riser_location,''),a.name,a.asset_tag);
 ctx:=jsonb_build_object('asset_id',a.id,'asset_tag',a.asset_tag,'riser_name',a.name,'riser_location',loc,'outlets_count',a.outlets_count,'last_inspection_at',a.last_inspection_at,'last_inspection_type',a.last_inspection_type,'last_inspection_result',a.last_inspection_result,'customer',c.name,'site_name',s.name,'address',s.address,'job_reference',j.reference_number,'customer_po',j.customer_po,'site_id',s.id,'planned_date',due,'visit_type',typ,'order',pos);
 answers:=jsonb_build_object('riser_asset_id',a.id,'riser_location',loc,'customer_details',c.name,'site_details',concat_ws(E'\n',s.name,s.address,s.postcode),'_riser_visit',ctx,'_system_label',loc);
 answers:=answers||jsonb_build_object('_visit_prefill',answers-'_riser_visit'-'_system_label');
 INSERT INTO public.job_sheet_responses(job_id,template_id,submitted_by,status,responses,system_label,org_id,created_at) VALUES(j.id,t.id,auth.uid(),'draft',answers,loc,o,now()+pos*interval '1 millisecond');
 END LOOP; END IF;
 RETURN j.id;
END $$;
REVOKE ALL ON FUNCTION public.create_site_riser_job(uuid,uuid,jsonb,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_site_riser_job(uuid,uuid,jsonb,uuid[]) TO authenticated;
