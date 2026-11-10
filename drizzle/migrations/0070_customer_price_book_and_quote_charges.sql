ALTER TABLE public.price_book_items ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id), ADD COLUMN IF NOT EXISTS rate_list text, ADD COLUMN IF NOT EXISTS pricing_kind text NOT NULL DEFAULT 'remedial', ADD COLUMN IF NOT EXISTS price_needed boolean NOT NULL DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id), ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id), ADD COLUMN IF NOT EXISTS attendance_mode text NOT NULL DEFAULT 'auto', ADD COLUMN IF NOT EXISTS attendance_locality text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS price_book_item_id uuid REFERENCES public.price_book_items(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS price_candidates uuid[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS automated_charge boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.refresh_quote_charges(p_quote uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.invoices%ROWTYPE; cfg jsonb; base numeric; fee numeric:=0; nm text; loc text; count_lines int;
BEGIN
 SELECT * INTO q FROM public.invoices WHERE id=p_quote AND org_id=public.get_user_org_id() FOR UPDATE;
 IF q.id IS NULL OR NOT public.has_role_in_org(auth.uid(),q.org_id,'admin') THEN RAISE EXCEPTION 'Only office staff can update quote charges'; END IF;
 IF q.document_type <> 'quote' OR q.status <> 'draft' THEN RETURN; END IF;
 SELECT value INTO cfg FROM public.app_settings WHERE org_id=q.org_id AND key='remedial_quote_pricing'; cfg:=coalesce(cfg,'{}');
 SELECT coalesce(sum(quantity*unit_price),0),count(*) INTO base,count_lines FROM public.invoice_line_items WHERE invoice_id=q.id AND NOT automated_charge;
 IF q.attendance_mode='auto' AND EXISTS(SELECT 1 FROM public.defects WHERE quote_id=q.id AND org_id=q.org_id) THEN
  SELECT name INTO nm FROM public.customers WHERE id=q.customer_id AND org_id=q.org_id; nm:=lower(coalesce(nm,q.customer_name));
  IF nm IN ('safely comply','integrity security group ltd') THEN fee:=40;
  ELSIF count_lines>0 AND base<coalesce((cfg->>'threshold')::numeric,95) THEN
   loc:=q.attendance_locality;
   IF loc='unknown' THEN SELECT CASE WHEN concat_ws(' ',s.name,s.address,s.postcode) ~* '\m(Manchester|Oldham)\M' THEN 'local' WHEN nullif(trim(concat_ws(' ',s.address,s.postcode)),'') IS NOT NULL THEN 'distant' ELSE 'unknown' END INTO loc FROM public.sites s WHERE s.id=q.site_id AND s.org_id=q.org_id; END IF;
   fee:=CASE WHEN loc='local' THEN coalesce((cfg->>'local_fee')::numeric,40) WHEN loc='distant' THEN coalesce((cfg->>'distant_fee')::numeric,60) ELSE 0 END;
  END IF;
  DELETE FROM public.invoice_line_items WHERE invoice_id=q.id AND automated_charge;
  IF fee>0 THEN INSERT INTO public.invoice_line_items(invoice_id,org_id,description,quantity,unit_price,amount,sort_order,automated_charge) VALUES(q.id,q.org_id,CASE WHEN nm IN ('safely comply','integrity security group ltd') THEN 'Attendance / certification fee' ELSE 'Attendance charge' END,1,fee,fee,999,true); END IF;
 ELSIF q.attendance_mode='removed' THEN DELETE FROM public.invoice_line_items WHERE invoice_id=q.id AND automated_charge; END IF;
 SELECT coalesce(sum(quantity*unit_price),0) INTO base FROM public.invoice_line_items WHERE invoice_id=q.id;
 UPDATE public.invoices SET subtotal=base,tax_amount=round(base*tax_rate/100,2),total=base+round(base*tax_rate/100,2) WHERE id=q.id;
END $$;
REVOKE ALL ON FUNCTION public.refresh_quote_charges(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.refresh_quote_charges(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.set_quote_attendance(p_quote uuid,p_mode text,p_locality text DEFAULT 'unknown',p_amount numeric DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.invoices%ROWTYPE;
BEGIN
 SELECT * INTO q FROM public.invoices WHERE id=p_quote AND org_id=public.get_user_org_id() FOR UPDATE;
 IF q.id IS NULL OR NOT public.has_role_in_org(auth.uid(),q.org_id,'admin') OR q.status<>'draft' OR q.document_type<>'quote' THEN RAISE EXCEPTION 'Only office staff can change a draft quote charge'; END IF;
 IF p_mode NOT IN ('auto','override','removed') OR p_locality NOT IN ('local','distant','unknown') OR (p_mode='override' AND (p_amount IS NULL OR p_amount<0)) THEN RAISE EXCEPTION 'Invalid attendance settings'; END IF;
 UPDATE public.invoices SET attendance_mode=p_mode,attendance_locality=p_locality WHERE id=q.id;
 IF p_mode='override' THEN
  DELETE FROM public.invoice_line_items WHERE invoice_id=q.id AND automated_charge;
  INSERT INTO public.invoice_line_items(invoice_id,org_id,description,quantity,unit_price,amount,sort_order,automated_charge) VALUES(q.id,q.org_id,'Attendance charge',1,p_amount,p_amount,999,true);
 END IF;
 PERFORM public.refresh_quote_charges(q.id);
END $$;
REVOKE ALL ON FUNCTION public.set_quote_attendance(uuid,text,text,numeric) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.set_quote_attendance(uuid,text,text,numeric) TO authenticated;
CREATE OR REPLACE FUNCTION public.apply_quote_price(p_line uuid,p_item uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.invoice_line_items%ROWTYPE; q public.invoices%ROWTYPE; p public.price_book_items%ROWTYPE;
BEGIN
 SELECT * INTO l FROM public.invoice_line_items WHERE id=p_line AND org_id=public.get_user_org_id(); SELECT * INTO q FROM public.invoices WHERE id=l.invoice_id AND org_id=l.org_id;
 SELECT * INTO p FROM public.price_book_items WHERE id=p_item AND org_id=l.org_id AND is_active AND NOT price_needed AND pricing_kind='remedial';
 IF q.id IS NULL OR p.id IS NULL OR q.status<>'draft' OR NOT public.has_role_in_org(auth.uid(),q.org_id,'admin') OR (p.customer_id IS NOT NULL AND p.customer_id IS DISTINCT FROM q.customer_id) OR (p.rate_list IS NOT NULL AND p.customer_id IS NULL) THEN RAISE EXCEPTION 'Price is not available for this quote'; END IF;
 UPDATE public.invoice_line_items SET unit_price=p.unit_price,amount=quantity*p.unit_price,price_book_item_id=p.id,price_match='matched',price_candidates='{}' WHERE id=l.id;
 PERFORM public.refresh_quote_charges(q.id);
END $$;
REVOKE ALL ON FUNCTION public.apply_quote_price(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.apply_quote_price(uuid,uuid) TO authenticated;
CREATE TRIGGER zz_price_book_customer_org BEFORE INSERT OR UPDATE ON public.price_book_items FOR EACH ROW EXECUTE FUNCTION public.guard_feature_org_references('customer_id','customers');