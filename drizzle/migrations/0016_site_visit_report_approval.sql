ALTER TABLE public.defects ADD COLUMN IF NOT EXISTS site_visit_report_id uuid REFERENCES public.site_visit_reports(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS defects_site_visit_report_idx ON public.defects(site_visit_report_id);
ALTER TABLE public.site_visit_reports ADD COLUMN IF NOT EXISTS gaps_resolved jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Guard: only org admins approve; approved reports are locked.
CREATE OR REPLACE FUNCTION public.guard_site_visit_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('svr.bypass', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Only office or admin users can approve a Site Visit Report.';
  END IF;
  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION 'This report is approved and locked. Unlock it to revise.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS site_visit_reports_guard ON public.site_visit_reports;
CREATE TRIGGER site_visit_reports_guard BEFORE UPDATE ON public.site_visit_reports
FOR EACH ROW EXECUTE FUNCTION public.guard_site_visit_report();

CREATE OR REPLACE FUNCTION public.approve_site_visit_report(_report_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.site_visit_reports; j record; rec jsonb; recs jsonb := '[]'::jsonb; new_id uuid; created int := 0;
BEGIN
  SELECT * INTO r FROM public.site_visit_reports WHERE id = _report_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF NOT public.is_org_admin(r.org_id) THEN RAISE EXCEPTION 'Only office or admin users can approve a Site Visit Report.'; END IF;
  IF r.status = 'approved' THEN RETURN jsonb_build_object('created', 0); END IF;
  SELECT id, site_id INTO j FROM public.jobs WHERE id = r.job_id;
  FOR rec IN SELECT * FROM jsonb_array_elements(r.recommendations) LOOP
    IF rec->>'owner_type' = 'us' AND coalesce(rec->>'defect_id','') = '' AND coalesce(trim(rec->>'action'),'') <> '' THEN
      INSERT INTO public.defects (org_id, job_id, site_id, reported_by, title, description, severity, status, category, source_kind, site_visit_report_id)
      VALUES (r.org_id, r.job_id, j.site_id, auth.uid(), left(trim(rec->>'action'), 200), trim(rec->>'action'), 'medium', 'open', 'other', 'job', r.id)
      RETURNING id INTO new_id;
      rec := jsonb_set(rec, '{defect_id}', to_jsonb(new_id::text));
      created := created + 1;
    END IF;
    recs := recs || jsonb_build_array(rec);
  END LOOP;
  PERFORM set_config('svr.bypass', 'on', true);
  UPDATE public.site_visit_reports SET recommendations = recs, status = 'approved', approved_by = auth.uid(), approved_at = now(),
    reviewed_by = coalesce(reviewed_by, auth.uid()) WHERE id = _report_id;
  PERFORM set_config('svr.bypass', 'off', true);
  INSERT INTO public.job_activity_log (job_id, user_id, action, details)
  VALUES (r.job_id, auth.uid(), 'site_visit_report_approved', format('Site Visit Report v%s approved%s', r.version, CASE WHEN created > 0 THEN format(' – %s defect(s) raised', created) ELSE '' END));
  RETURN jsonb_build_object('created', created);
END $$;

CREATE OR REPLACE FUNCTION public.unlock_site_visit_report(_report_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.site_visit_reports;
BEGIN
  SELECT * INTO r FROM public.site_visit_reports WHERE id = _report_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF NOT public.is_org_admin(r.org_id) THEN RAISE EXCEPTION 'Only office or admin users can unlock an approved report.'; END IF;
  IF r.status <> 'approved' THEN RETURN; END IF;
  PERFORM set_config('svr.bypass', 'on', true);
  UPDATE public.site_visit_reports SET status = 'draft', version = version + 1, approved_by = NULL, approved_at = NULL, reviewed_by = NULL WHERE id = _report_id;
  PERFORM set_config('svr.bypass', 'off', true);
  INSERT INTO public.job_activity_log (job_id, user_id, action, details)
  VALUES (r.job_id, auth.uid(), 'site_visit_report_unlocked', format('Site Visit Report unlocked to revise (now v%s)', r.version + 1));
END $$;

REVOKE ALL ON FUNCTION public.approve_site_visit_report(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.unlock_site_visit_report(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.approve_site_visit_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_site_visit_report(uuid) TO authenticated;