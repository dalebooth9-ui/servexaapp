CREATE OR REPLACE FUNCTION public.parse_sheet_date(_raw text)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE v text := btrim(coalesce(_raw,'')); m text[]; y int; mo int; d int;
BEGIN
  IF v = '' THEN RETURN NULL; END IF;
  m := regexp_match(v, '^(\d{4})-(\d{1,2})-(\d{1,2})([T ].*)?$');
  IF m IS NOT NULL THEN y:=m[1]::int; mo:=m[2]::int; d:=m[3]::int;
  ELSE
    m := regexp_match(v, '^(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2}|\d{4})$');
    IF m IS NULL THEN RETURN NULL; END IF;
    d:=m[1]::int; mo:=m[2]::int; y:=m[3]::int; IF length(m[3])=2 THEN y:=y+2000; END IF;
  END IF;
  BEGIN RETURN make_date(y, mo, d); EXCEPTION WHEN others THEN RETURN NULL; END;
END $$;
GRANT EXECUTE ON FUNCTION public.parse_sheet_date(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.upsert_service_schedule_from_response(_response_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    public.parse_sheet_date(v_resp.responses->>'inspection_date'),
    public.parse_sheet_date(v_resp.responses->>'date_of_inspection'),
    public.parse_sheet_date(v_resp.responses->>'_paper_completion_at'),
    public.parse_sheet_date(v_resp.responses->>'date'),
    v_job.completed_at::date, v_resp.submitted_at::date, CURRENT_DATE);
  v_next_due := v_inspection_date + (v_interval || ' months')::interval;
  SELECT * INTO v_existing FROM public.site_service_schedules
  WHERE org_id = v_resp.org_id AND site_id IS NOT DISTINCT FROM v_job.site_id
    AND template_id = v_resp.template_id LIMIT 1;
  IF v_existing.id IS NULL THEN
    INSERT INTO public.site_service_schedules (org_id, site_id, customer_id, template_id, work_type,
      last_done_date, last_response_id, last_job_id, interval_months, next_due_date)
    VALUES (v_resp.org_id, v_job.site_id, v_job.customer_id, v_resp.template_id, v_job.category,
      v_inspection_date, _response_id, v_job.id, v_interval, v_next_due)
    RETURNING id INTO v_schedule_id;
  ELSE
    IF v_existing.last_done_date IS NULL OR v_inspection_date >= v_existing.last_done_date THEN
      UPDATE public.site_service_schedules
      SET last_done_date = v_inspection_date, last_response_id = _response_id, last_job_id = v_job.id,
          customer_id = COALESCE(v_job.customer_id, customer_id), work_type = COALESCE(v_job.category, work_type),
          interval_months = v_interval, next_due_date = v_next_due, next_job_id = NULL,
          reminder_lead_sent_at = NULL, reminder_due_sent_at = NULL, active = true
      WHERE id = v_existing.id;
    END IF;
    v_schedule_id := v_existing.id;
  END IF;
  RETURN v_schedule_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_site_unit_from_response()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE su uuid; r jsonb; d date; j public.jobs;
BEGIN
 IF NEW.status <> 'submitted' OR NOT (NEW.responses ? '_site_unit_id') THEN RETURN NEW; END IF;
 su:=NULLIF(NEW.responses->>'_site_unit_id','')::uuid; IF su IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO j FROM public.jobs WHERE id=NEW.job_id AND org_id=NEW.org_id;
 IF NOT EXISTS(SELECT 1 FROM public.site_units WHERE id=su AND org_id=NEW.org_id AND site_id IS NOT DISTINCT FROM j.site_id) THEN RAISE EXCEPTION 'Selected unit does not belong to this job''s site'; END IF;
 r:=coalesce(NEW.responses->'_site_unit_result','{}'::jsonb);
 d:=coalesce(public.parse_sheet_date(r->>'inspected'),public.parse_sheet_date(NEW.responses->>'_paper_completion_at'),(coalesce(NEW.submitted_at,now()) AT TIME ZONE 'Europe/London')::date);
 UPDATE public.site_units SET
   last_inspected=d,
   last_reading=CASE WHEN r->>'reading' ~ '^\d+(\.\d+)?$' THEN (r->>'reading')::numeric ELSE last_reading END,
   last_reading_unit=coalesce(NULLIF(r->>'reading_unit',''),last_reading_unit),
   last_result=coalesce(NULLIF(r->>'result',''),last_result),
   location=coalesce(NULLIF(btrim(r->>'location'),''),location),
   unit_type=coalesce(NULLIF(btrim(r->>'type'),''),unit_type),
   access_notes=coalesce(access_notes,NULLIF(btrim(r->>'access_notes'),'')),
   updated_at=now()
 WHERE id=su AND (last_inspected IS NULL OR last_inspected<=d);
 RETURN NEW;
END $function$;