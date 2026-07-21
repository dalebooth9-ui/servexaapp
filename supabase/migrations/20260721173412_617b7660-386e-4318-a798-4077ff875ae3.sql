
CREATE OR REPLACE FUNCTION public.confirm_paper_scan_job(
  _template_id uuid,
  _customer_id uuid,
  _site_id uuid,
  _completed_at timestamptz,
  _date_known boolean,
  _category text,
  _responses jsonb,
  _customer_po text DEFAULT NULL,
  _existing_job_id uuid DEFAULT NULL,
  _batch_item_id uuid DEFAULT NULL,
  _override_name text DEFAULT NULL
) RETURNS TABLE(job_id uuid, reference_number text, was_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_org uuid;
  v_template_name text;
  v_site_name text;
  v_site_addr text;
  v_customer_name text;
  v_job_name text;
  v_job_id uuid;
  v_ref text;
  v_backfill_source text;
  v_po text;
  v_matched_by_po uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _template_id IS NULL OR _customer_id IS NULL OR _site_id IS NULL THEN
    RAISE EXCEPTION 'template, customer and site are required';
  END IF;
  IF _completed_at IS NULL THEN RAISE EXCEPTION 'completed_at is required'; END IF;

  SELECT p.org_id INTO v_org FROM public.profiles p WHERE p.user_id = v_user;
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organisation for user'; END IF;

  SELECT t.name INTO v_template_name FROM public.job_sheet_templates t WHERE t.id = _template_id;
  IF v_template_name IS NULL THEN RAISE EXCEPTION 'Template not found'; END IF;
  SELECT s.name, s.address INTO v_site_name, v_site_addr FROM public.sites s WHERE s.id = _site_id;
  SELECT c.name INTO v_customer_name FROM public.customers c WHERE c.id = _customer_id;

  v_job_name := v_template_name || ' — ' || COALESCE(
    NULLIF(TRIM(v_site_name), ''),
    NULLIF(TRIM(v_site_addr), ''),
    NULLIF(TRIM(v_customer_name), ''),
    'Site'
  );
  IF _override_name IS NOT NULL
     AND length(TRIM(_override_name)) BETWEEN 3 AND 160
     AND _override_name !~* '(scope of work|we have,? today|carried out|hydraulic pressure test\.|certificate of)'
  THEN
    v_job_name := TRIM(_override_name);
  END IF;

  v_backfill_source := CASE WHEN _date_known THEN 'paper backfill' ELSE 'paper backfill (date unknown)' END;

  -- SAFETY NET: if no explicit target and a PO is supplied, auto-attach to any
  -- existing job in this org+customer that already has the same PO. Prevents
  -- duplicate jobs when the reviewer files multiple sheets from one visit
  -- through paths that don't run the client-side PO dedup prompt.
  v_po := NULLIF(TRIM(_customer_po), '');
  IF _existing_job_id IS NULL AND v_po IS NOT NULL THEN
    SELECT j.id INTO v_matched_by_po
      FROM public.jobs j
     WHERE j.org_id = v_org
       AND j.customer_id = _customer_id
       AND LOWER(TRIM(j.customer_po)) = LOWER(v_po)
       AND j.status <> 'cancelled'
     ORDER BY j.created_at ASC
     LIMIT 1;
  END IF;

  IF _existing_job_id IS NOT NULL OR v_matched_by_po IS NOT NULL THEN
    UPDATE public.jobs j
       SET status = 'completed',
           completed_by = v_user,
           completed_at = _completed_at,
           historic_backfill = true,
           source = v_backfill_source,
           customer_po = COALESCE(NULLIF(TRIM(_customer_po), ''), j.customer_po)
     WHERE j.id = COALESCE(_existing_job_id, v_matched_by_po) AND j.org_id = v_org
     RETURNING j.id, j.reference_number INTO v_job_id, v_ref;
    IF v_job_id IS NULL THEN RAISE EXCEPTION 'Existing job not found in your organisation'; END IF;
  ELSE
    INSERT INTO public.jobs AS j (
      name, customer, customer_id, site_id, address, status, priority,
      category, source, historic_backfill, created_by, completed_by,
      completed_at, customer_po,
      pressure_test_qty, visual_qty, other_qty
    ) VALUES (
      v_job_name, v_customer_name, _customer_id, _site_id,
      NULLIF(TRIM(v_site_addr), ''), 'completed', 'medium',
      COALESCE(_category, 'general'), v_backfill_source, true, v_user, v_user,
      _completed_at, v_po,
      CASE WHEN _category = 'pressure_test' THEN 1 ELSE 0 END,
      CASE WHEN _category = 'visual' THEN 1 ELSE 0 END,
      CASE WHEN _category NOT IN ('pressure_test','visual') THEN 1 ELSE 0 END
    )
    RETURNING j.id, j.reference_number INTO v_job_id, v_ref;
  END IF;

  INSERT INTO public.job_sheet_responses (job_id, template_id, submitted_by, status, submitted_at, responses)
    VALUES (v_job_id, _template_id, v_user, 'submitted', now(), COALESCE(_responses, '{}'::jsonb));

  IF _batch_item_id IS NOT NULL THEN
    UPDATE public.paper_scan_batch_items pbi
       SET status = 'confirmed',
           created_job_id = v_job_id,
           matched_existing_job = (_existing_job_id IS NOT NULL OR v_matched_by_po IS NOT NULL),
           reviewed_by = v_user,
           reviewed_at = now()
     WHERE pbi.id = _batch_item_id AND pbi.org_id = v_org;
  END IF;

  job_id := v_job_id;
  confirm_paper_scan_job.reference_number := v_ref;
  was_new := (_existing_job_id IS NULL AND v_matched_by_po IS NULL);
  RETURN NEXT;
END;
$$;
