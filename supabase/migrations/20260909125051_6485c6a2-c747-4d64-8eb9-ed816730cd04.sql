
-- 1. Quote approved -> linked defects approved
CREATE OR REPLACE FUNCTION public.sync_defects_on_quote_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.document_type = 'quote'
     AND NEW.status IN ('approved','accepted')
     AND COALESCE(OLD.status,'') IS DISTINCT FROM NEW.status THEN
    UPDATE public.defects
       SET status = 'approved', updated_at = now()
     WHERE quote_id = NEW.id
       AND status IN ('open','in_progress','quoted');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_defects_on_quote_approval ON public.invoices;
CREATE TRIGGER trg_sync_defects_on_quote_approval
AFTER UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_defects_on_quote_approval();

-- 2. Remedial job created from quote -> defects marked job_created
CREATE OR REPLACE FUNCTION public.create_remedial_job_from_quote(_quote_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quote   public.invoices;
  v_org     uuid;
  v_site_id uuid;
  v_cust_id uuid;
  v_cust_nm text;
  v_ref     text;
  v_job_id  uuid;
  v_title   text;
BEGIN
  SELECT * INTO v_quote FROM public.invoices WHERE id = _quote_id;
  IF NOT FOUND OR v_quote.document_type <> 'quote' THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  v_org := v_quote.org_id;
  IF NOT public.has_role_in_org(auth.uid(), v_org, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT DISTINCT remedial_job_id INTO v_job_id
    FROM public.defects
   WHERE quote_id = _quote_id AND remedial_job_id IS NOT NULL
   LIMIT 1;
  IF v_job_id IS NOT NULL THEN RETURN v_job_id; END IF;

  SELECT d.site_id, j.customer_id, c.name
    INTO v_site_id, v_cust_id, v_cust_nm
    FROM public.defects d
    LEFT JOIN public.jobs j      ON j.id = d.job_id
    LEFT JOIN public.customers c ON c.id = j.customer_id
   WHERE d.quote_id = _quote_id
   LIMIT 1;

  v_ref := public.generate_job_reference(v_org);
  v_title := 'Remedial works — ' || COALESCE(v_cust_nm, v_quote.customer_name, 'Customer');

  INSERT INTO public.jobs
    (org_id, reference, title, customer, customer_id, site_id,
     status, category, created_by, notes)
  VALUES
    (v_org, v_ref, v_title, COALESCE(v_cust_nm, v_quote.customer_name),
     v_cust_id, v_site_id,
     'active', 'remedial', auth.uid(),
     'Created from accepted quote ' || v_quote.invoice_number)
  RETURNING id INTO v_job_id;

  INSERT INTO public.job_remedial_items
    (job_id, org_id, seq, description, status, source, created_by)
  SELECT v_job_id, v_org,
         row_number() OVER (ORDER BY d.created_at),
         COALESCE(NULLIF(d.description, ''), d.title),
         'pending', 'defect', auth.uid()
    FROM public.defects d
   WHERE d.quote_id = _quote_id;

  UPDATE public.defects
     SET remedial_job_id = v_job_id,
         status = 'job_created',
         updated_at = now()
   WHERE quote_id = _quote_id;

  RETURN v_job_id;
END;
$function$;

-- 3. Attach defects to an existing quote as new line items
CREATE OR REPLACE FUNCTION public.attach_defects_to_quote(_defect_ids uuid[], _quote_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org      uuid;
  v_quote    public.invoices;
  v_next     int;
BEGIN
  IF _defect_ids IS NULL OR array_length(_defect_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No defects supplied';
  END IF;

  SELECT * INTO v_quote FROM public.invoices WHERE id = _quote_id;
  IF NOT FOUND OR v_quote.document_type <> 'quote' THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;
  v_org := v_quote.org_id;

  IF NOT public.has_role_in_org(auth.uid(), v_org, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF EXISTS (SELECT 1 FROM public.defects WHERE id = ANY(_defect_ids) AND org_id <> v_org) THEN
    RAISE EXCEPTION 'Defects belong to a different organisation';
  END IF;

  SELECT COALESCE(max(sort_order), 0) INTO v_next
    FROM public.invoice_line_items WHERE invoice_id = _quote_id;

  INSERT INTO public.invoice_line_items
    (invoice_id, org_id, description, quantity, unit_price, amount, sort_order, source_defect_ids)
  SELECT _quote_id, v_org,
         COALESCE(NULLIF(d.description, ''), d.title),
         1, 0, 0,
         v_next + row_number() OVER (ORDER BY d.created_at),
         ARRAY[d.id]
    FROM public.defects d
   WHERE d.id = ANY(_defect_ids)
     AND d.quote_id IS DISTINCT FROM _quote_id;

  UPDATE public.defects
     SET quote_id = _quote_id,
         status = CASE WHEN status IN ('open','in_progress') THEN 'quoted' ELSE status END,
         updated_at = now()
   WHERE id = ANY(_defect_ids);

  RETURN _quote_id;
END;
$$;
