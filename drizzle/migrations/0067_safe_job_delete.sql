ALTER TABLE public.job_risers DROP CONSTRAINT job_risers_job_id_fkey,
  ADD CONSTRAINT job_risers_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
ALTER TABLE public.ops_notification_requests DROP CONSTRAINT ops_notification_requests_job_id_fkey,
  ADD CONSTRAINT ops_notification_requests_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
ALTER TABLE public.pending_whatsapp_scans DROP CONSTRAINT pending_whatsapp_scans_created_job_id_fkey,
  ADD CONSTRAINT pending_whatsapp_scans_created_job_id_fkey FOREIGN KEY (created_job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
ALTER TABLE public.jobs DROP CONSTRAINT jobs_merged_into_job_id_fkey,
  ADD CONSTRAINT jobs_merged_into_job_id_fkey FOREIGN KEY (merged_into_job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.preview_job_delete(_job_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid := public.get_user_org_id(); _out jsonb := '[]'::jsonb; j record; _b text[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only admins can delete jobs'; END IF;
  FOR j IN SELECT id, reference_number, name FROM jobs WHERE id = ANY(_job_ids) AND org_id = _org LOOP
    _b := ARRAY[]::text[];
    IF EXISTS (SELECT 1 FROM job_sheet_responses WHERE job_id=j.id AND status='submitted') THEN _b := _b || 'a completed report'::text; END IF;
    IF EXISTS (SELECT 1 FROM site_visit_reports WHERE job_id=j.id AND status::text IN ('reviewed','approved')) THEN _b := _b || 'an approved site visit report'::text; END IF;
    IF EXISTS (SELECT 1 FROM job_signatures WHERE job_id=j.id) THEN _b := _b || 'a customer sign-off'::text; END IF;
    IF EXISTS (SELECT 1 FROM invoices WHERE job_id=j.id AND document_type='quote' AND status <> 'draft') THEN _b := _b || 'a sent or accepted quote'::text; END IF;
    IF EXISTS (SELECT 1 FROM invoices WHERE job_id=j.id AND document_type <> 'quote') THEN _b := _b || 'an invoice'::text; END IF;
    _out := _out || jsonb_build_object(
      'id', j.id, 'reference', j.reference_number, 'name', j.name, 'blockers', to_jsonb(_b),
      'visits', (SELECT count(*) FROM job_visits WHERE job_id=j.id),
      'risers', (SELECT count(*) FROM job_risers WHERE job_id=j.id AND selected),
      'draft_quotes', (SELECT count(*) FROM invoices WHERE job_id=j.id AND document_type='quote' AND status='draft'),
      'draft_reports', (SELECT count(*) FROM job_sheet_responses WHERE job_id=j.id AND status <> 'submitted'),
      'assignments', (SELECT count(*) FROM job_assignments WHERE job_id=j.id),
      'photos', (SELECT count(*) FROM job_documents WHERE job_id=j.id));
  END LOOP;
  RETURN _out;
END $$;

CREATE OR REPLACE FUNCTION public.delete_jobs_safely(_job_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid := public.get_user_org_id(); _p jsonb; _blocked text; _n integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only admins can delete jobs'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(_job_ids) x WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE id=x AND org_id=_org)) THEN
    RAISE EXCEPTION 'One or more jobs were not found in your company';
  END IF;
  _p := public.preview_job_delete(_job_ids);
  SELECT string_agg((e->>'reference') || ' has ' || array_to_string(ARRAY(SELECT jsonb_array_elements_text(e->'blockers')), ', '), '; ')
    INTO _blocked FROM jsonb_array_elements(_p) e WHERE jsonb_array_length(e->'blockers') > 0;
  IF _blocked IS NOT NULL THEN RAISE EXCEPTION '% — archive instead', _blocked; END IF;
  DELETE FROM invoices WHERE job_id = ANY(_job_ids) AND document_type='quote' AND status='draft';
  DELETE FROM jobs WHERE id = ANY(_job_ids) AND org_id = _org;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.preview_job_delete(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_jobs_safely(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_job_delete(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_jobs_safely(uuid[]) TO authenticated;