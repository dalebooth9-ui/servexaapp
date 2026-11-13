CREATE OR REPLACE FUNCTION public.get_riser_report_context(_job_id uuid, _response_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_user_org_id(); u uuid:=auth.uid(); j public.jobs%ROWTYPE; r public.job_sheet_responses%ROWTYPE; a public.assets%ROWTYPE; s public.sites%ROWTYPE; c public.customers%ROWTYPE;
BEGIN
IF u IS NULL OR o IS NULL OR NOT public.is_org_active(o) OR public.is_customer_user(u) OR NOT (public.has_role_in_org(u,o,'admin') OR public.has_role_in_org(u,o,'engineer')) THEN RAISE EXCEPTION 'Staff access required'; END IF;
SELECT * INTO j FROM public.jobs WHERE id=_job_id AND org_id=o;
IF j.id IS NULL OR NOT (public.has_role_in_org(u,o,'admin') OR EXISTS(SELECT 1 FROM public.job_assignments WHERE job_id=j.id AND org_id=o AND engineer_id=u)) THEN RAISE EXCEPTION 'This job is not available to your account'; END IF;
SELECT * INTO r FROM public.job_sheet_responses WHERE id=_response_id AND job_id=j.id AND org_id=o AND archived_at IS NULL;
IF r.id IS NULL THEN RAISE EXCEPTION 'The requested report could not be loaded'; END IF;
SELECT * INTO a FROM public.assets WHERE org_id=o AND id::text=coalesce(r.responses->>'riser_asset_id',r.responses->'_riser_visit'->>'asset_id') AND asset_type IN ('Dry Riser','Wet Riser') AND merged_into_asset_id IS NULL;
IF a.id IS NULL OR a.site_id IS DISTINCT FROM j.site_id THEN RAISE EXCEPTION 'The report riser does not belong to this job site'; END IF;
SELECT * INTO s FROM public.sites WHERE id=a.site_id AND org_id=o AND deleted_at IS NULL;
IF s.id IS NULL OR nullif(trim(s.name),'') IS NULL OR nullif(trim(s.address),'') IS NULL THEN RAISE EXCEPTION 'Site name or address is missing'; END IF;
SELECT * INTO c FROM public.customers WHERE id=j.customer_id AND org_id=o;
IF c.id IS NULL OR nullif(trim(c.name),'') IS NULL THEN RAISE EXCEPTION 'The job customer could not be loaded'; END IF;
IF a.outlets_count IS NULL OR a.inlets_count IS NULL THEN RAISE EXCEPTION 'The riser inlet or outlet count has not been recorded'; END IF;
RETURN jsonb_build_object('job_id',j.id,'job_reference',j.reference_number,'asset_id',a.id,'asset_tag',a.asset_tag,'riser_name',a.name,'riser_location',coalesce(nullif(a.riser_location,''),a.name,a.asset_tag),'outlets_count',a.outlets_count,'inlets_count',a.inlets_count,'site_id',s.id,'site_name',s.name,'address',s.address,'postcode',s.postcode,'customer',c.name,'outlet_codes',public.asset_outlet_codes(a.id));
END; $$;
REVOKE ALL ON FUNCTION public.get_riser_report_context(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_riser_report_context(uuid,uuid) TO authenticated,service_role;