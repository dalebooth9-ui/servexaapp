CREATE OR REPLACE FUNCTION public.defect_customer_for_quote(p_defect uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT public.has_role_in_org(auth.uid(),public.get_user_org_id(),'admin') THEN RAISE EXCEPTION 'Only office staff can price quotes'; END IF; RETURN public.defect_customer(p_defect); END $$; REVOKE ALL ON FUNCTION public.defect_customer_for_quote(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.defect_customer_for_quote(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.draft_quote_from_defects(_defect_ids uuid[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o uuid:=public.get_user_org_id(); d public.defects%ROWTYPE; c public.customers%ROWTYPE; s public.sites%ROWTYPE; q uuid; n int;
BEGIN
 IF NOT public.has_role_in_org(auth.uid(),o,'admin') THEN RAISE EXCEPTION 'Only office staff can draft quotes'; END IF;
 IF coalesce(cardinality(_defect_ids),0)=0 THEN RAISE EXCEPTION 'No defects supplied'; END IF;
 SELECT count(*) INTO n FROM public.defects WHERE id=ANY(_defect_ids) AND org_id=o AND quote_id IS NULL;
 IF n<>cardinality(_defect_ids) THEN RAISE EXCEPTION 'One or more defects is unavailable or already quoted'; END IF;
 SELECT * INTO d FROM public.defects WHERE id=_defect_ids[1] AND org_id=o;
 IF EXISTS(SELECT 1 FROM public.defects WHERE id=ANY(_defect_ids) AND site_id IS DISTINCT FROM d.site_id) THEN RAISE EXCEPTION 'All defects must belong to the same site'; END IF;
 SELECT * INTO c FROM public.customers WHERE id=public.defect_customer(d.id) AND org_id=o; SELECT * INTO s FROM public.sites WHERE id=d.site_id AND org_id=o;
 INSERT INTO public.invoices(org_id,document_type,status,customer_id,site_id,customer_name,customer_email,customer_address,invoice_number,created_by,notes) VALUES(o,'quote','draft',c.id,s.id,coalesce(c.name,''),c.email,concat_ws(', ',s.address,s.postcode),'QUO-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5)),auth.uid(),'Auto-drafted from selected defects') RETURNING id INTO q;
 INSERT INTO public.invoice_line_items(invoice_id,org_id,description,quantity,unit_price,amount,sort_order) SELECT q,o,coalesce(nullif(description,''),title),1,0,0,row_number() OVER(ORDER BY created_at) FROM public.defects WHERE id=ANY(_defect_ids) AND org_id=o;
 UPDATE public.defects SET quote_id=q,status=CASE WHEN status IN ('open','in_progress') THEN 'quoted' ELSE status END,updated_at=now() WHERE id=ANY(_defect_ids) AND org_id=o; RETURN q;
END $$;