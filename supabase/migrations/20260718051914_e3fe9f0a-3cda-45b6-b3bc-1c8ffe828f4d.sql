
CREATE TABLE public.service_intervals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.job_sheet_templates(id) ON DELETE CASCADE,
  work_type text,
  interval_months integer NOT NULL CHECK (interval_months > 0 AND interval_months <= 120),
  reminder_lead_weeks integer NOT NULL DEFAULT 4,
  send_due_date_reminder boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, template_id),
  UNIQUE (org_id, work_type),
  CHECK (template_id IS NOT NULL OR work_type IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_intervals TO authenticated;
GRANT ALL ON public.service_intervals TO service_role;
ALTER TABLE public.service_intervals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read intervals in org" ON public.service_intervals FOR SELECT TO authenticated
  USING (org_id = get_user_org_id());
CREATE POLICY "Admins manage intervals in org" ON public.service_intervals FOR ALL TO authenticated
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE TRIGGER trg_service_intervals_updated_at BEFORE UPDATE ON public.service_intervals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.site_service_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.job_sheet_templates(id) ON DELETE SET NULL,
  work_type text,
  last_done_date date,
  last_response_id uuid REFERENCES public.job_sheet_responses(id) ON DELETE SET NULL,
  last_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  interval_months integer NOT NULL,
  next_due_date date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  next_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  reminder_lead_sent_at timestamptz,
  reminder_due_sent_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, site_id, template_id),
  CHECK (site_id IS NOT NULL OR customer_id IS NOT NULL)
);
CREATE INDEX site_service_schedules_org_next_due_idx ON public.site_service_schedules(org_id, next_due_date) WHERE active;
CREATE INDEX site_service_schedules_site_idx ON public.site_service_schedules(site_id);
CREATE INDEX site_service_schedules_customer_idx ON public.site_service_schedules(customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_service_schedules TO authenticated;
GRANT ALL ON public.site_service_schedules TO service_role;
ALTER TABLE public.site_service_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read schedules in org" ON public.site_service_schedules FOR SELECT TO authenticated
  USING (org_id = get_user_org_id());
CREATE POLICY "Admins manage schedules in org" ON public.site_service_schedules FOR ALL TO authenticated
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE TRIGGER trg_site_service_schedules_updated_at BEFORE UPDATE ON public.site_service_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.renewal_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES public.site_service_schedules(id) ON DELETE CASCADE,
  site_id uuid,
  customer_id uuid,
  job_id uuid,
  reminder_kind text NOT NULL CHECK (reminder_kind IN ('lead','due','manual')),
  recipient_email text NOT NULL,
  subject text NOT NULL,
  body_snippet text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
  error_message text,
  sent_at timestamptz,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX renewal_reminder_log_org_created_idx ON public.renewal_reminder_log(org_id, created_at DESC);
CREATE INDEX renewal_reminder_log_schedule_idx ON public.renewal_reminder_log(schedule_id);
GRANT SELECT, INSERT ON public.renewal_reminder_log TO authenticated;
GRANT ALL ON public.renewal_reminder_log TO service_role;
ALTER TABLE public.renewal_reminder_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read reminder log in org" ON public.renewal_reminder_log FOR SELECT TO authenticated
  USING (org_id = get_user_org_id());
CREATE POLICY "Admins insert reminder log in org" ON public.renewal_reminder_log FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS renewal_reminders_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renewal_reminder_template text,
  ADD COLUMN IF NOT EXISTS renewal_reminder_from_name text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS renewal_reminders_opt_out boolean NOT NULL DEFAULT false;

INSERT INTO public.service_intervals (org_id, work_type, interval_months, reminder_lead_weeks)
SELECT o.id, wt.work_type, wt.months, 4
FROM public.organisations o
CROSS JOIN (VALUES
  ('dry_riser', 6),
  ('dry_riser_pressure_test', 12),
  ('wet_riser', 6),
  ('sprinkler', 6),
  ('commercial_sprinkler', 12),
  ('fire_extinguisher', 12),
  ('fire_hydrant', 12),
  ('fire_alarm', 6),
  ('em_lighting', 6)
) AS wt(work_type, months)
ON CONFLICT (org_id, work_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.upsert_service_schedule_from_response(_response_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_resp record; v_job record; v_interval integer;
  v_inspection_date date; v_next_due date;
  v_schedule_id uuid; v_existing record;
BEGIN
  SELECT r.id, r.job_id, r.template_id, r.org_id, r.responses, r.submitted_at, r.status INTO v_resp
  FROM public.job_sheet_responses r WHERE r.id = _response_id;
  IF NOT FOUND OR v_resp.status <> 'submitted' THEN RETURN NULL; END IF;

  SELECT j.id, j.org_id, j.site_id, j.customer_id, j.category, j.completed_at INTO v_job
  FROM public.jobs j WHERE j.id = v_resp.job_id;
  IF v_job.site_id IS NULL AND v_job.customer_id IS NULL THEN RETURN NULL; END IF;

  SELECT interval_months INTO v_interval FROM public.service_intervals
  WHERE org_id = v_resp.org_id AND template_id = v_resp.template_id AND active LIMIT 1;
  IF v_interval IS NULL AND v_job.category IS NOT NULL THEN
    SELECT interval_months INTO v_interval FROM public.service_intervals
    WHERE org_id = v_resp.org_id AND work_type = v_job.category AND active LIMIT 1;
  END IF;
  IF v_interval IS NULL THEN RETURN NULL; END IF;

  v_inspection_date := COALESCE(
    NULLIF(v_resp.responses->>'inspection_date','')::date,
    NULLIF(v_resp.responses->>'date_of_inspection','')::date,
    NULLIF(v_resp.responses->>'date','')::date,
    v_job.completed_at::date,
    v_resp.submitted_at::date,
    CURRENT_DATE
  );
  v_next_due := v_inspection_date + (v_interval || ' months')::interval;

  SELECT * INTO v_existing FROM public.site_service_schedules
  WHERE org_id = v_resp.org_id
    AND site_id IS NOT DISTINCT FROM v_job.site_id
    AND template_id = v_resp.template_id LIMIT 1;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.site_service_schedules (
      org_id, site_id, customer_id, template_id, work_type,
      last_done_date, last_response_id, last_job_id,
      interval_months, next_due_date
    ) VALUES (
      v_resp.org_id, v_job.site_id, v_job.customer_id, v_resp.template_id, v_job.category,
      v_inspection_date, _response_id, v_job.id,
      v_interval, v_next_due
    ) RETURNING id INTO v_schedule_id;
  ELSE
    IF v_existing.last_done_date IS NULL OR v_inspection_date >= v_existing.last_done_date THEN
      UPDATE public.site_service_schedules
      SET last_done_date = v_inspection_date,
          last_response_id = _response_id,
          last_job_id = v_job.id,
          customer_id = COALESCE(v_job.customer_id, customer_id),
          work_type = COALESCE(v_job.category, work_type),
          interval_months = v_interval,
          next_due_date = v_next_due,
          next_job_id = NULL,
          reminder_lead_sent_at = NULL,
          reminder_due_sent_at = NULL,
          active = true
      WHERE id = v_existing.id;
    END IF;
    v_schedule_id := v_existing.id;
  END IF;
  RETURN v_schedule_id;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_service_schedule_from_response(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_service_schedule_from_response(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_response_upsert_schedule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'submitted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'submitted') THEN
    PERFORM public.upsert_service_schedule_from_response(NEW.id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_job_sheet_responses_schedule ON public.job_sheet_responses;
CREATE TRIGGER trg_job_sheet_responses_schedule
  AFTER INSERT OR UPDATE OF status ON public.job_sheet_responses
  FOR EACH ROW EXECUTE FUNCTION public.trg_response_upsert_schedule();

CREATE OR REPLACE FUNCTION public.upsert_service_schedule_from_historic(_report_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_report record; v_interval integer; v_next_due date;
  v_existing record; v_schedule_id uuid;
BEGIN
  SELECT h.id, h.org_id, h.site_id, h.customer_id, h.template_id, h.report_date, h.work_type INTO v_report
  FROM public.historic_reports h WHERE h.id = _report_id;
  IF NOT FOUND OR v_report.site_id IS NULL OR v_report.report_date IS NULL THEN RETURN NULL; END IF;

  SELECT interval_months INTO v_interval FROM public.service_intervals
  WHERE org_id = v_report.org_id
    AND (template_id = v_report.template_id OR work_type = v_report.work_type)
    AND active
  ORDER BY (template_id = v_report.template_id) DESC LIMIT 1;
  IF v_interval IS NULL THEN RETURN NULL; END IF;

  v_next_due := v_report.report_date + (v_interval || ' months')::interval;

  SELECT * INTO v_existing FROM public.site_service_schedules
  WHERE org_id = v_report.org_id
    AND site_id = v_report.site_id
    AND template_id IS NOT DISTINCT FROM v_report.template_id LIMIT 1;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.site_service_schedules (
      org_id, site_id, customer_id, template_id, work_type,
      last_done_date, interval_months, next_due_date
    ) VALUES (
      v_report.org_id, v_report.site_id, v_report.customer_id,
      v_report.template_id, v_report.work_type,
      v_report.report_date, v_interval, v_next_due
    ) RETURNING id INTO v_schedule_id;
  ELSIF v_existing.last_done_date IS NULL OR v_report.report_date > v_existing.last_done_date THEN
    UPDATE public.site_service_schedules
    SET last_done_date = v_report.report_date,
        interval_months = v_interval,
        next_due_date = v_next_due,
        active = true
    WHERE id = v_existing.id;
    v_schedule_id := v_existing.id;
  ELSE
    v_schedule_id := v_existing.id;
  END IF;
  RETURN v_schedule_id;
END; $$;
REVOKE ALL ON FUNCTION public.upsert_service_schedule_from_historic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_service_schedule_from_historic(uuid) TO authenticated, service_role;
