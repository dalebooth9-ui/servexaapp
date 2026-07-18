
CREATE TABLE IF NOT EXISTS public.price_book_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  code text,
  description text NOT NULL,
  category text,
  unit text NOT NULL DEFAULT 'each',
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_book_items_org_idx ON public.price_book_items(org_id);
CREATE INDEX IF NOT EXISTS price_book_items_desc_trgm ON public.price_book_items USING gin (lower(description) gin_trgm_ops);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_book_items TO authenticated;
GRANT ALL ON public.price_book_items TO service_role;
ALTER TABLE public.price_book_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read price book in org" ON public.price_book_items
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

CREATE POLICY "Admins manage price book in org" ON public.price_book_items
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE TRIGGER trg_price_book_items_updated
  BEFORE UPDATE ON public.price_book_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.defects
  ADD COLUMN IF NOT EXISTS source_response_id uuid REFERENCES public.job_sheet_responses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS defects_source_response_idx ON public.defects(source_response_id) WHERE source_response_id IS NOT NULL;


CREATE OR REPLACE FUNCTION public.capture_defects_from_response(_response_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resp     public.job_sheet_responses;
  v_job      public.jobs;
  v_key      text;
  v_val      jsonb;
  v_txt      text;
  v_issue    text := '';
  v_recomm   text := '';
  v_priority text := NULL;
  v_remedial boolean := false;
  v_photos   jsonb := '[]'::jsonb;
  v_fails    text[] := '{}';
  v_title    text;
  v_desc     text;
  v_sev      text := 'medium';
  v_defect   uuid;
BEGIN
  SELECT * INTO v_resp FROM public.job_sheet_responses WHERE id = _response_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF EXISTS (SELECT 1 FROM public.defects WHERE source_response_id = v_resp.id) THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = v_resp.job_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF COALESCE(v_job.historic_backfill, false) THEN RETURN 0; END IF;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(v_resp.responses) LOOP
    v_txt := CASE jsonb_typeof(v_val)
               WHEN 'string' THEN v_val #>> '{}'
               WHEN 'null'   THEN NULL
               ELSE v_val::text
             END;

    IF jsonb_typeof(v_val) = 'array' AND v_key ~* 'photo|image|attach' THEN
      v_photos := v_photos || v_val;
      CONTINUE;
    END IF;

    IF v_txt IS NULL OR btrim(v_txt) = '' THEN CONTINUE; END IF;

    IF v_key ~* 'remedial.*(required|action)' AND v_txt ILIKE 'yes%' THEN
      v_remedial := true;
    ELSIF v_key ~* 'priority' THEN
      v_priority := v_txt;
    ELSIF v_key ~* 'issue|fault|defect' AND length(btrim(v_txt)) > 2 THEN
      v_issue := v_issue || CASE WHEN v_issue = '' THEN '' ELSE E'\n' END || v_txt;
    ELSIF v_key ~* 'recommend|remedial' AND length(btrim(v_txt)) > 2 THEN
      v_recomm := v_recomm || CASE WHEN v_recomm = '' THEN '' ELSE E'\n' END || v_txt;
    ELSIF upper(btrim(v_txt)) IN ('FAIL','UNSATISFACTORY','NO','DEFECTIVE') THEN
      v_fails := v_fails || regexp_replace(v_key, '[_-]+', ' ', 'g');
    END IF;
  END LOOP;

  IF NOT (v_remedial OR v_issue <> '' OR v_recomm <> '' OR array_length(v_fails,1) IS NOT NULL) THEN
    RETURN 0;
  END IF;

  v_title := COALESCE(NULLIF(split_part(v_issue, E'\n', 1), ''),
                      NULLIF('Failing: ' || array_to_string(v_fails, ', '), 'Failing: '),
                      'Remedial action required');
  IF length(v_title) > 200 THEN v_title := left(v_title, 197) || '...'; END IF;

  v_desc := trim(BOTH E'\n' FROM concat_ws(E'\n\n',
    NULLIF(v_issue, ''),
    CASE WHEN v_recomm <> '' THEN 'Recommendation:' || E'\n' || v_recomm END,
    CASE WHEN array_length(v_fails,1) IS NOT NULL
         THEN 'Failing checks:' || E'\n- ' || array_to_string(v_fails, E'\n- ') END
  ));

  v_sev := CASE lower(COALESCE(v_priority, ''))
             WHEN 'urgent'   THEN 'critical'
             WHEN 'critical' THEN 'critical'
             WHEN 'high'     THEN 'high'
             WHEN 'low'      THEN 'low'
             ELSE 'medium'
           END;

  INSERT INTO public.defects
    (org_id, site_id, job_id, reported_by, title, description,
     severity, status, category, photos, source_response_id)
  VALUES
    (v_resp.org_id, v_job.site_id, v_job.id, v_resp.submitted_by,
     v_title, v_desc, v_sev, 'open', 'other', v_photos, v_resp.id)
  RETURNING id INTO v_defect;

  RETURN 1;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_defects_from_response(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capture_defects_from_response(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_capture_defects_from_response()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status IN ('submitted','completed','filed'))
     OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status
         AND NEW.status IN ('submitted','completed','filed')) THEN
    PERFORM public.capture_defects_from_response(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_defects_after_response ON public.job_sheet_responses;
CREATE TRIGGER capture_defects_after_response
AFTER INSERT OR UPDATE ON public.job_sheet_responses
FOR EACH ROW EXECUTE FUNCTION public.trg_capture_defects_from_response();


CREATE OR REPLACE FUNCTION public.draft_quote_from_defects(_defect_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org      uuid;
  v_cust_id  uuid;
  v_cust_nm  text := '';
  v_cust_em  text;
  v_site_nm  text := '';
  v_site_id  uuid;
  v_quote_id uuid;
  v_number   text;
  v_count    int;
BEGIN
  IF _defect_ids IS NULL OR array_length(_defect_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No defects supplied';
  END IF;

  SELECT d.org_id, d.site_id, s.name, j.customer_id, c.name, c.email
    INTO v_org, v_site_id, v_site_nm, v_cust_id, v_cust_nm, v_cust_em
    FROM public.defects d
    LEFT JOIN public.sites s     ON s.id = d.site_id
    LEFT JOIN public.jobs  j     ON j.id = d.job_id
    LEFT JOIN public.customers c ON c.id = j.customer_id
   WHERE d.id = _defect_ids[1];

  IF v_org IS NULL THEN RAISE EXCEPTION 'Defect not found'; END IF;

  IF NOT public.has_role_in_org(auth.uid(), v_org, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT count(DISTINCT COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid))
    INTO v_count FROM public.defects WHERE id = ANY(_defect_ids);
  IF v_count > 1 THEN RAISE EXCEPTION 'All defects must belong to the same site'; END IF;

  v_number := 'QUO-' || to_char(now(), 'YYYYMMDD') || '-' ||
              upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));

  INSERT INTO public.invoices
    (org_id, document_type, status, customer_name, customer_email,
     invoice_number, created_by, notes)
  VALUES
    (v_org, 'quote', 'draft', COALESCE(v_cust_nm, ''), v_cust_em,
     v_number, auth.uid(),
     'Auto-drafted from ' || array_length(_defect_ids,1) ||
     ' defect(s)' ||
     CASE WHEN v_site_nm <> '' THEN ' at ' || v_site_nm ELSE '' END)
  RETURNING id INTO v_quote_id;

  INSERT INTO public.invoice_line_items
    (invoice_id, org_id, description, quantity, unit_price, amount, sort_order)
  SELECT v_quote_id, v_org,
         COALESCE(NULLIF(d.description, ''), d.title),
         1, 0, 0,
         row_number() OVER (ORDER BY d.created_at)
    FROM public.defects d
   WHERE d.id = ANY(_defect_ids);

  UPDATE public.defects
     SET quote_id = v_quote_id,
         status   = CASE WHEN status IN ('open','in_progress') THEN 'quoted' ELSE status END,
         updated_at = now()
   WHERE id = ANY(_defect_ids);

  RETURN v_quote_id;
END;
$$;

REVOKE ALL ON FUNCTION public.draft_quote_from_defects(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.draft_quote_from_defects(uuid[]) TO authenticated;


CREATE OR REPLACE FUNCTION public.create_remedial_job_from_quote(_quote_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
         status = 'in_progress',
         updated_at = now()
   WHERE quote_id = _quote_id;

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_remedial_job_from_quote(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_remedial_job_from_quote(uuid) TO authenticated;
