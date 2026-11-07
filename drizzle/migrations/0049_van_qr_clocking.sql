
ALTER TABLE public.time_clock
  ADD COLUMN IF NOT EXISTS van_id uuid,
  ADD COLUMN IF NOT EXISTS break_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS break_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS start_source text,
  ADD COLUMN IF NOT EXISTS finish_source text,
  ADD COLUMN IF NOT EXISTS client_start_id text,
  ADD COLUMN IF NOT EXISTS client_finish_id text,
  ADD COLUMN IF NOT EXISTS recorded_offline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS missing_finish boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS time_clock_client_start_uq ON public.time_clock(user_id, client_start_id) WHERE client_start_id IS NOT NULL;

CREATE TABLE public.vans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE DEFAULT public.get_user_org_id(),
  name text NOT NULL,
  registration text,
  qr_token text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vans TO authenticated;
GRANT ALL ON public.vans TO service_role;
ALTER TABLE public.vans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view own company vans" ON public.vans FOR SELECT TO authenticated USING (org_id = public.get_user_org_id() AND NOT public.is_customer_user(auth.uid()));
CREATE POLICY "Admins manage own company vans" ON public.vans FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE TABLE public.timesheet_settings (
  org_id uuid PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE DEFAULT public.get_user_org_id(),
  standard_break_minutes integer NOT NULL DEFAULT 0,
  break_button_enabled boolean NOT NULL DEFAULT true,
  missing_finish_time time NOT NULL DEFAULT '20:00',
  far_scan_km numeric NOT NULL DEFAULT 5,
  min_day_minutes integer NOT NULL DEFAULT 2,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.timesheet_settings TO authenticated;
GRANT ALL ON public.timesheet_settings TO service_role;
ALTER TABLE public.timesheet_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read timesheet settings" ON public.timesheet_settings FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());
CREATE POLICY "Admins manage timesheet settings" ON public.timesheet_settings FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE TABLE public.time_clock_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  time_clock_id uuid NOT NULL REFERENCES public.time_clock(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  edited_by uuid NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.time_clock_edits TO authenticated;
GRANT ALL ON public.time_clock_edits TO service_role;
ALTER TABLE public.time_clock_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view time edits" ON public.time_clock_edits FOR SELECT TO authenticated USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "Engineers view edits to own times" ON public.time_clock_edits FOR SELECT TO authenticated USING (org_id = public.get_user_org_id() AND employee_id = auth.uid());

CREATE TABLE public.time_clock_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT public.get_user_org_id(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  time_clock_id uuid REFERENCES public.time_clock(id) ON DELETE SET NULL,
  work_date date NOT NULL,
  note text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.time_clock_corrections TO authenticated;
GRANT ALL ON public.time_clock_corrections TO service_role;
ALTER TABLE public.time_clock_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Engineers view own corrections" ON public.time_clock_corrections FOR SELECT TO authenticated USING (org_id = public.get_user_org_id() AND user_id = auth.uid());
CREATE POLICY "Admins manage corrections" ON public.time_clock_corrections FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE TABLE public.timesheet_week_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  approved_by uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, week_start)
);
GRANT SELECT ON public.timesheet_week_approvals TO authenticated;
GRANT ALL ON public.timesheet_week_approvals TO service_role;
ALTER TABLE public.timesheet_week_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view approvals" ON public.timesheet_week_approvals FOR SELECT TO authenticated USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "Engineers view own approvals" ON public.timesheet_week_approvals FOR SELECT TO authenticated USING (org_id = public.get_user_org_id() AND user_id = auth.uid());

-- Engineers no longer write their own times directly; all writes go through the RPCs below.
DROP POLICY IF EXISTS "Engineers can insert own clock entries" ON public.time_clock;
DROP POLICY IF EXISTS "Engineers can update own clock entries" ON public.time_clock;
DROP POLICY IF EXISTS "Engineers can view own clock entries" ON public.time_clock;
CREATE POLICY "Engineers view own clock entries" ON public.time_clock FOR SELECT TO authenticated USING (auth.uid() = user_id AND org_id = public.get_user_org_id());

CREATE OR REPLACE FUNCTION public._notify_org_admins(_org uuid, _title text, _msg text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications(user_id, title, message, org_id)
  SELECT DISTINCT m.user_id, _title, _msg, _org FROM public.organisation_members m
  WHERE m.org_id = _org AND m.status = 'active' AND m.role IN ('owner','admin');
$$;
REVOKE ALL ON FUNCTION public._notify_org_admins(uuid,text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._km(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT 6371 * 2 * asin(sqrt(power(sin(radians(b_lat-a_lat)/2),2) + cos(radians(a_lat))*cos(radians(b_lat))*power(sin(radians(b_lng-a_lng)/2),2)));
$$;

CREATE OR REPLACE FUNCTION public._clamp_scan_time(_at timestamptz)
RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF _at IS NULL OR _at > now() + interval '5 minutes' THEN RETURN now(); END IF;
  IF _at < now() - interval '7 days' THEN RAISE EXCEPTION 'This saved scan is more than 7 days old. Please ask the office to add it.'; END IF;
  RETURN _at;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_van(_token text)
RETURNS TABLE(id uuid, name text, registration text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.id, v.name, v.registration FROM public.vans v
  WHERE v.qr_token = upper(trim(_token)) AND v.org_id = public.get_user_org_id() AND v.active;
$$;

CREATE OR REPLACE FUNCTION public.clock_start_day(_van_id uuid, _at timestamptz, _lat double precision, _lng double precision, _client_id text, _source text DEFAULT 'button')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); org uuid := public.get_user_org_id(); t timestamptz; existing public.time_clock; s public.timesheet_settings; f text[] := '{}'; avg_lat double precision; avg_lng double precision; n int; row public.time_clock;
BEGIN
  IF uid IS NULL OR org IS NULL THEN RAISE EXCEPTION 'Please log in first.'; END IF;
  IF public.is_customer_user(uid) THEN RAISE EXCEPTION 'Only staff can clock in.'; END IF;
  IF _client_id IS NOT NULL THEN
    SELECT * INTO existing FROM public.time_clock WHERE user_id = uid AND client_start_id = _client_id;
    IF FOUND THEN RETURN jsonb_build_object('result','started','entry',to_jsonb(existing)); END IF;
  END IF;
  IF _van_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vans WHERE id = _van_id AND org_id = org) THEN RAISE EXCEPTION 'That van is not in your company.'; END IF;
  t := public._clamp_scan_time(_at);
  SELECT * INTO existing FROM public.time_clock WHERE user_id = uid AND clock_out_at IS NULL
    AND (clock_in_at AT TIME ZONE 'Europe/London')::date = (t AT TIME ZONE 'Europe/London')::date ORDER BY clock_in_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('result','already_started','entry',to_jsonb(existing)); END IF;
  SELECT * INTO s FROM public.timesheet_settings WHERE org_id = org;
  IF _lat IS NOT NULL THEN
    SELECT avg(clock_in_lat), avg(clock_in_lng), count(*) INTO avg_lat, avg_lng, n FROM (
      SELECT clock_in_lat, clock_in_lng FROM public.time_clock WHERE user_id = uid AND clock_in_lat IS NOT NULL ORDER BY clock_in_at DESC LIMIT 20) q;
    IF n >= 3 AND public._km(avg_lat, avg_lng, _lat, _lng) > COALESCE(s.far_scan_km, 5) THEN f := f || 'far_from_usual_start'; END IF;
  ELSE f := f || 'no_location';
  END IF;
  INSERT INTO public.time_clock(user_id, org_id, clock_in_at, clock_in_lat, clock_in_lng, van_id, start_source, client_start_id, recorded_offline, flags)
  VALUES (uid, org, t, _lat, _lng, _van_id, _source, _client_id, t < now() - interval '2 minutes', f) RETURNING * INTO row;
  RETURN jsonb_build_object('result','started','entry',to_jsonb(row));
END $$;

CREATE OR REPLACE FUNCTION public._recalc_time_clock(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.time_clock; s public.timesheet_settings; gross int; brk int;
BEGIN
  SELECT * INTO r FROM public.time_clock WHERE id = _id;
  IF r.clock_out_at IS NULL THEN UPDATE public.time_clock SET total_minutes = NULL WHERE id = _id; RETURN; END IF;
  SELECT * INTO s FROM public.timesheet_settings WHERE org_id = r.org_id;
  gross := GREATEST(0, round(extract(epoch FROM r.clock_out_at - r.clock_in_at)/60)::int);
  brk := r.break_minutes;
  IF brk = 0 AND COALESCE(s.standard_break_minutes,0) > 0 AND gross > s.standard_break_minutes THEN brk := s.standard_break_minutes; END IF;
  UPDATE public.time_clock SET total_minutes = GREATEST(0, gross - brk),
    flags = CASE WHEN gross < COALESCE(s.min_day_minutes,2) THEN (array_remove(flags,'very_short_day') || 'very_short_day'::text) ELSE array_remove(flags,'very_short_day') END
  WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public._recalc_time_clock(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.clock_finish_day(_at timestamptz, _lat double precision, _lng double precision, _client_id text, _source text DEFAULT 'button')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); t timestamptz; r public.time_clock;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please log in first.'; END IF;
  IF _client_id IS NOT NULL THEN
    SELECT * INTO r FROM public.time_clock WHERE user_id = uid AND client_finish_id = _client_id;
    IF FOUND THEN RETURN jsonb_build_object('result','finished','entry',to_jsonb(r)); END IF;
  END IF;
  t := public._clamp_scan_time(_at);
  SELECT * INTO r FROM public.time_clock WHERE user_id = uid AND clock_out_at IS NULL AND clock_in_at <= t
    AND clock_in_at > t - interval '20 hours' ORDER BY clock_in_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'You have no working day started today, so there is nothing to finish.'; END IF;
  UPDATE public.time_clock SET clock_out_at = t, clock_out_lat = _lat, clock_out_lng = _lng, finish_source = _source,
    client_finish_id = _client_id, missing_finish = false,
    break_minutes = break_minutes + CASE WHEN break_started_at IS NOT NULL THEN GREATEST(0, round(extract(epoch FROM t - break_started_at)/60)::int) ELSE 0 END,
    break_started_at = NULL,
    recorded_offline = recorded_offline OR t < now() - interval '2 minutes'
  WHERE id = r.id;
  PERFORM public._recalc_time_clock(r.id);
  SELECT * INTO r FROM public.time_clock WHERE id = r.id;
  RETURN jsonb_build_object('result','finished','entry',to_jsonb(r));
END $$;

CREATE OR REPLACE FUNCTION public.clock_break(_action text, _at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); t timestamptz := public._clamp_scan_time(_at); r public.time_clock;
BEGIN
  SELECT * INTO r FROM public.time_clock WHERE user_id = uid AND clock_out_at IS NULL ORDER BY clock_in_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Start your day before taking a break.'; END IF;
  IF _action = 'start' THEN
    IF r.break_started_at IS NULL THEN UPDATE public.time_clock SET break_started_at = t WHERE id = r.id; END IF;
  ELSIF _action = 'end' THEN
    IF r.break_started_at IS NOT NULL THEN
      UPDATE public.time_clock SET break_minutes = break_minutes + GREATEST(0, round(extract(epoch FROM t - break_started_at)/60)::int), break_started_at = NULL WHERE id = r.id;
    END IF;
  ELSE RAISE EXCEPTION 'Unknown break action'; END IF;
  SELECT * INTO r FROM public.time_clock WHERE id = r.id;
  RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.admin_edit_time_clock(_id uuid, _clock_in timestamptz, _clock_out timestamptz, _break_minutes integer, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.time_clock; uid uuid := auth.uid();
BEGIN
  SELECT * INTO r FROM public.time_clock WHERE id = _id;
  IF NOT FOUND OR r.org_id <> public.get_user_org_id() OR NOT public.has_role_in_org(uid, r.org_id, 'admin'::app_role) THEN RAISE EXCEPTION 'Only the office can edit times.'; END IF;
  IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'Please give a reason for the change.'; END IF;
  IF _clock_out IS NOT NULL AND _clock_out <= _clock_in THEN RAISE EXCEPTION 'Finish must be after start.'; END IF;
  IF _clock_in IS DISTINCT FROM r.clock_in_at THEN
    INSERT INTO public.time_clock_edits(org_id,time_clock_id,employee_id,edited_by,field,old_value,new_value,reason) VALUES (r.org_id,_id,r.user_id,uid,'start',r.clock_in_at::text,_clock_in::text,_reason); END IF;
  IF _clock_out IS DISTINCT FROM r.clock_out_at THEN
    INSERT INTO public.time_clock_edits(org_id,time_clock_id,employee_id,edited_by,field,old_value,new_value,reason) VALUES (r.org_id,_id,r.user_id,uid,'finish',r.clock_out_at::text,_clock_out::text,_reason); END IF;
  IF _break_minutes IS DISTINCT FROM r.break_minutes THEN
    INSERT INTO public.time_clock_edits(org_id,time_clock_id,employee_id,edited_by,field,old_value,new_value,reason) VALUES (r.org_id,_id,r.user_id,uid,'break',r.break_minutes::text,_break_minutes::text,_reason); END IF;
  UPDATE public.time_clock SET clock_in_at = _clock_in, clock_out_at = _clock_out, break_minutes = GREATEST(0,COALESCE(_break_minutes,0)),
    break_started_at = CASE WHEN _clock_out IS NOT NULL THEN NULL ELSE break_started_at END,
    missing_finish = CASE WHEN _clock_out IS NOT NULL THEN false ELSE missing_finish END WHERE id = _id;
  PERFORM public._recalc_time_clock(_id);
END $$;

CREATE OR REPLACE FUNCTION public.set_timesheet_week_approval(_user_id uuid, _week_start date, _approved boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE org uuid := public.get_user_org_id();
BEGIN
  IF NOT public.has_role_in_org(auth.uid(), org, 'admin'::app_role) THEN RAISE EXCEPTION 'Only the office can approve timesheets.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND org_id = org) THEN RAISE EXCEPTION 'That person is not in your company.'; END IF;
  IF _approved THEN
    IF EXISTS (SELECT 1 FROM public.time_clock WHERE user_id = _user_id AND org_id = org AND clock_out_at IS NULL
      AND (clock_in_at AT TIME ZONE 'Europe/London')::date BETWEEN _week_start AND _week_start + 6) THEN
      RAISE EXCEPTION 'This week has a day with no finish time. Fix it before approving.'; END IF;
    INSERT INTO public.timesheet_week_approvals(org_id,user_id,week_start,approved_by) VALUES (org,_user_id,_week_start,auth.uid())
    ON CONFLICT (org_id,user_id,week_start) DO UPDATE SET approved_by = excluded.approved_by, approved_at = now();
  ELSE
    DELETE FROM public.timesheet_week_approvals WHERE org_id = org AND user_id = _user_id AND week_start = _week_start;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.request_time_correction(_time_clock_id uuid, _work_date date, _note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); org uuid := public.get_user_org_id(); nid uuid; nm text;
BEGIN
  IF uid IS NULL OR org IS NULL THEN RAISE EXCEPTION 'Please log in first.'; END IF;
  IF COALESCE(trim(_note),'') = '' THEN RAISE EXCEPTION 'Please add a short note.'; END IF;
  IF _time_clock_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.time_clock WHERE id = _time_clock_id AND user_id = uid) THEN RAISE EXCEPTION 'That day is not yours.'; END IF;
  INSERT INTO public.time_clock_corrections(org_id,user_id,time_clock_id,work_date,note) VALUES (org,uid,_time_clock_id,_work_date,left(_note,500)) RETURNING id INTO nid;
  SELECT full_name INTO nm FROM public.profiles WHERE user_id = uid;
  PERFORM public._notify_org_admins(org, 'Timesheet correction requested', COALESCE(nm,'An engineer') || ' (' || to_char(_work_date,'DD/MM/YYYY') || '): ' || left(_note,200));
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.check_missing_clock_finishes()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; local_now timestamp := now() AT TIME ZONE 'Europe/London';
BEGIN
  FOR r IN
    SELECT tc.id, tc.org_id, tc.user_id, tc.clock_in_at, p.full_name FROM public.time_clock tc
    LEFT JOIN public.timesheet_settings s ON s.org_id = tc.org_id
    LEFT JOIN public.profiles p ON p.user_id = tc.user_id
    WHERE tc.clock_out_at IS NULL AND NOT tc.missing_finish
      AND ((tc.clock_in_at AT TIME ZONE 'Europe/London')::date < local_now::date
        OR local_now::time >= COALESCE(s.missing_finish_time, '20:00'::time))
  LOOP
    UPDATE public.time_clock SET missing_finish = true WHERE id = r.id;
    PERFORM public._notify_org_admins(r.org_id, 'Missing finish time', COALESCE(r.full_name,'An engineer') || ' started on ' || to_char(r.clock_in_at AT TIME ZONE 'Europe/London','DD/MM/YYYY "at" HH24:MI') || ' but has not finished the day.');
  END LOOP;
  IF local_now::time >= '07:00' THEN
    INSERT INTO public.notifications(user_id,title,message,org_id)
    SELECT tc.user_id, 'You forgot to finish your day', 'You started on ' || to_char(tc.clock_in_at AT TIME ZONE 'Europe/London','DD/MM/YYYY "at" HH24:MI') || ' but did not finish. Open My timesheet and send a correction.', tc.org_id
    FROM public.time_clock tc WHERE tc.missing_finish AND tc.clock_out_at IS NULL AND tc.reminder_sent_at IS NULL
      AND (tc.clock_in_at AT TIME ZONE 'Europe/London')::date < local_now::date;
    UPDATE public.time_clock SET reminder_sent_at = now() WHERE missing_finish AND clock_out_at IS NULL AND reminder_sent_at IS NULL
      AND (clock_in_at AT TIME ZONE 'Europe/London')::date < local_now::date;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.check_missing_clock_finishes() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.resolve_van(text), public.clock_start_day(uuid,timestamptz,double precision,double precision,text,text), public.clock_finish_day(timestamptz,double precision,double precision,text,text), public.clock_break(text,timestamptz), public.admin_edit_time_clock(uuid,timestamptz,timestamptz,integer,text), public.set_timesheet_week_approval(uuid,date,boolean), public.request_time_correction(uuid,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_van(text), public.clock_start_day(uuid,timestamptz,double precision,double precision,text,text), public.clock_finish_day(timestamptz,double precision,double precision,text,text), public.clock_break(text,timestamptz), public.admin_edit_time_clock(uuid,timestamptz,timestamptz,integer,text), public.set_timesheet_week_approval(uuid,date,boolean), public.request_time_correction(uuid,date,text) TO authenticated;

SELECT cron.schedule('check-missing-clock-finishes', '0 * * * *', 'SELECT public.check_missing_clock_finishes();');
