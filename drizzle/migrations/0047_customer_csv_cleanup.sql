CREATE TABLE public.customer_cleanup_archive (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, winner_customer_id uuid NOT NULL REFERENCES public.customers(id), source_customer_id uuid NOT NULL, source_record jsonb NOT NULL, merged_by uuid NOT NULL, merged_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.customer_cleanup_archive TO authenticated;
GRANT ALL ON public.customer_cleanup_archive TO service_role;
ALTER TABLE public.customer_cleanup_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY cleanup_archive_admin_read ON public.customer_cleanup_archive FOR SELECT TO authenticated USING (org_id=public.get_user_org_id() AND public.is_org_admin(org_id));
CREATE OR REPLACE FUNCTION public.customer_cleanup_counts(_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_user_org_id(); _c public.customers; _r record; _n bigint; _counts jsonb:='{}';
BEGIN
 IF _org IS NULL OR NOT public.is_org_admin(_org) THEN RAISE EXCEPTION 'Only a company admin can clean up customers'; END IF;
 SELECT * INTO _c FROM customers WHERE id=_id AND org_id=_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found in your company'; END IF;
 FOR _r IN SELECT c.table_name,c.column_name FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name) WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.data_type='uuid' AND c.column_name IN ('customer_id','guess_customer_id','existing_customer_id','new_customer_id','winner_customer_id') AND c.table_name<>'customer_merge_suggestions' LOOP
 EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',_r.table_name,_r.column_name) INTO _n USING _id;
 IF _n>0 THEN _counts:=jsonb_set(_counts,ARRAY[_r.table_name],to_jsonb(coalesce((_counts->>_r.table_name)::bigint,0)+_n)); END IF;
 END LOOP;
 SELECT count(*) INTO _n FROM jobs WHERE org_id=_org AND customer_id IS NULL AND lower(regexp_replace(trim(customer),'\s+',' ','g'))=lower(regexp_replace(trim(_c.name),'\s+',' ','g'));
 IF _n>0 THEN _counts:=jsonb_set(_counts,'{unlinked_jobs}',to_jsonb(_n)); END IF;
 SELECT count(*) INTO _n FROM invoices WHERE org_id=_org AND lower(regexp_replace(trim(customer_name),'\s+',' ','g'))=lower(regexp_replace(trim(_c.name),'\s+',' ','g'));
 IF _n>0 THEN _counts:=jsonb_set(_counts,'{invoices_and_quotes}',to_jsonb(_n)); END IF;
 IF coalesce(trim(_c.email),'')<>'' OR coalesce(trim(_c.phone),'')<>'' OR coalesce(_c.xero_contact_id,_c.quickbooks_contact_id,_c.sage_contact_id,_c.freeagent_contact_id) IS NOT NULL THEN _counts:=jsonb_set(_counts,'{contact_details}','1'); END IF;
 RETURN _counts;
END $$;
REVOKE ALL ON FUNCTION public.customer_cleanup_counts(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_cleanup_counts(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.customer_cleanup_preview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_user_org_id(); _result jsonb;
BEGIN
 IF _org IS NULL OR NOT public.is_org_admin(_org) THEN RAISE EXCEPTION 'Only a company admin can clean up customers'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'created_at',c.created_at,'counts',public.customer_cleanup_counts(c.id)) ORDER BY c.name,c.created_at,c.id),'[]'::jsonb) INTO _result FROM customers c WHERE c.org_id=_org;
 RETURN _result;
END $$;
REVOKE ALL ON FUNCTION public.customer_cleanup_preview() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_cleanup_preview() TO authenticated;
CREATE OR REPLACE FUNCTION public.apply_customer_cleanup(_listed_names text[],_remove_ids uuid[] DEFAULT '{}',_merges jsonb DEFAULT '[]') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_user_org_id(); _id uuid; _target uuid; _source uuid; _c public.customers; _t public.customers; _m jsonb; _r record; _counts jsonb; _results jsonb:='[]'; _n bigint;
BEGIN
 IF _org IS NULL OR NOT public.is_org_admin(_org) THEN RAISE EXCEPTION 'Only a company admin can clean up customers'; END IF;
 IF jsonb_typeof(_merges)<>'array' THEN RAISE EXCEPTION 'Invalid merge selection'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_org::text||':customer-cleanup',0));
 PERFORM id FROM customers WHERE org_id=_org ORDER BY id FOR UPDATE;
 FOR _id IN SELECT DISTINCT x FROM (SELECT unnest(coalesce(_remove_ids,'{}')) x UNION ALL SELECT (value->>'source_id')::uuid FROM jsonb_array_elements(_merges)) q LOOP
 SELECT * INTO _c FROM customers WHERE id=_id AND org_id=_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'A selected customer is not in your company; refresh the preview'; END IF;
 IF NOT EXISTS(SELECT 1 FROM unnest(_listed_names) n WHERE lower(regexp_replace(trim(n),'\s+',' ','g'))=lower(regexp_replace(trim(_c.name),'\s+',' ','g'))) THEN RAISE EXCEPTION 'Only customers on the uploaded list may be changed'; END IF;
 IF lower(regexp_replace(trim(_c.name),'\s+',' ','g'))='c watkins plumbing ltd' THEN RAISE EXCEPTION 'C Watkins Plumbing Ltd is protected and cannot be removed'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_merges) m WHERE (m->>'target_id')::uuid=ANY(_remove_ids) OR EXISTS(SELECT 1 FROM jsonb_array_elements(_merges) s WHERE s->>'source_id'=m->>'target_id')) THEN RAISE EXCEPTION 'A merge winner cannot also be removed or merged'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(_merges))<>(SELECT count(DISTINCT value->>'source_id') FROM jsonb_array_elements(_merges)) THEN RAISE EXCEPTION 'A customer can only be merged once'; END IF;
 FOR _m IN SELECT value FROM jsonb_array_elements(_merges) LOOP
 _source:=(_m->>'source_id')::uuid; _target:=(_m->>'target_id')::uuid;
 IF _source=_target OR _source=ANY(_remove_ids) THEN RAISE EXCEPTION 'Invalid overlapping selection'; END IF;
 SELECT * INTO _c FROM customers WHERE id=_source AND org_id=_org;
 SELECT * INTO _t FROM customers WHERE id=_target AND org_id=_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Merge winner not found in your company'; END IF;
 _counts:=public.customer_cleanup_counts(_source);
 INSERT INTO customer_cleanup_archive(org_id,winner_customer_id,source_customer_id,source_record,merged_by) VALUES(_org,_target,_source,to_jsonb(_c),auth.uid());
 DELETE FROM customer_sites s WHERE s.customer_id=_source AND s.org_id=_org AND EXISTS(SELECT 1 FROM customer_sites k WHERE k.customer_id=_target AND k.site_id=s.site_id AND k.org_id=_org);
 FOR _r IN SELECT c.table_name,c.column_name,EXISTS(SELECT 1 FROM information_schema.columns o WHERE o.table_schema=c.table_schema AND o.table_name=c.table_name AND o.column_name='org_id') scoped FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name) WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.data_type='uuid' AND c.column_name IN ('customer_id','guess_customer_id','existing_customer_id','new_customer_id','winner_customer_id') LOOP
 IF _r.scoped THEN EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1 AND org_id IS DISTINCT FROM $2',_r.table_name,_r.column_name) INTO _n USING _source,_org; IF _n>0 THEN RAISE EXCEPTION 'A linked record belongs to another company; no changes made'; END IF; END IF;
 EXECUTE format('UPDATE public.%I SET %I=$1 WHERE %I=$2%s',_r.table_name,_r.column_name,_r.column_name,CASE WHEN _r.scoped THEN ' AND org_id=$3' ELSE '' END) USING _target,_source,_org;
 END LOOP;
 UPDATE jobs SET customer=_t.name WHERE org_id=_org AND customer_id=_target;
 UPDATE jobs SET customer_id=_target,customer=_t.name WHERE org_id=_org AND customer_id IS NULL AND lower(regexp_replace(trim(customer),'\s+',' ','g'))=lower(regexp_replace(trim(_c.name),'\s+',' ','g'));
 UPDATE invoices SET customer_name=_t.name WHERE org_id=_org AND lower(regexp_replace(trim(customer_name),'\s+',' ','g'))=lower(regexp_replace(trim(_c.name),'\s+',' ','g'));
 UPDATE customers SET email=coalesce(nullif(email,''),_c.email),phone=coalesce(nullif(phone,''),_c.phone),address=coalesce(nullif(address,''),_c.address),logo_url=coalesce(nullif(logo_url,''),_c.logo_url),print_logo_url=coalesce(nullif(print_logo_url,''),_c.print_logo_url),brand_colour=coalesce(nullif(brand_colour,''),_c.brand_colour),xero_contact_id=coalesce(xero_contact_id,_c.xero_contact_id),quickbooks_contact_id=coalesce(quickbooks_contact_id,_c.quickbooks_contact_id),sage_contact_id=coalesce(sage_contact_id,_c.sage_contact_id),freeagent_contact_id=coalesce(freeagent_contact_id,_c.freeagent_contact_id),updated_at=now() WHERE id=_target AND org_id=_org;
 DELETE FROM customers WHERE id=_source AND org_id=_org;
 _results:=_results||jsonb_build_object('id',_source,'name',_c.name,'status','Merged','into',_t.name,'counts',_counts);
 END LOOP;
 FOR _id IN SELECT DISTINCT unnest(coalesce(_remove_ids,'{}')) LOOP
 SELECT * INTO _c FROM customers WHERE id=_id AND org_id=_org;
 _counts:=public.customer_cleanup_counts(_id);
 IF _counts<>'{}'::jsonb THEN _results:=_results||jsonb_build_object('id',_id,'name',_c.name,'status','Skipped','counts',_counts); CONTINUE; END IF;
 DELETE FROM customer_merge_suggestions WHERE org_id=_org AND (existing_customer_id=_id OR new_customer_id=_id);
 DELETE FROM customers WHERE id=_id AND org_id=_org;
 _results:=_results||jsonb_build_object('id',_id,'name',_c.name,'status','Removed');
 END LOOP;
 INSERT INTO audit_logs(user_id,org_id,action,resource_id) VALUES(auth.uid(),_org,'customer_csv_cleanup',NULL);
 RETURN _results;
END $$;
REVOKE ALL ON FUNCTION public.apply_customer_cleanup(text[],uuid[],jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_customer_cleanup(text[],uuid[],jsonb) TO authenticated;