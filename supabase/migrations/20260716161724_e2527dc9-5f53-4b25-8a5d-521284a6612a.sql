
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS suspension_message text,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by uuid,
  ADD COLUMN IF NOT EXISTS reactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz;

CREATE OR REPLACE FUNCTION public.validate_organisation_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('active','suspended','cancelled') THEN
    RAISE EXCEPTION 'Invalid organisation status: %', NEW.status;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_organisation_status ON public.organisations;
CREATE TRIGGER trg_validate_organisation_status
BEFORE INSERT OR UPDATE ON public.organisations
FOR EACH ROW EXECUTE FUNCTION public.validate_organisation_status();

UPDATE public.organisations SET status = 'active' WHERE status IS NULL OR status = '';

CREATE OR REPLACE FUNCTION public.prevent_platform_org_suspension()
RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  IF NEW.id = '11111111-1111-1111-1111-111111111111'::uuid AND NEW.status <> 'active' THEN
    RAISE EXCEPTION 'The platform owner organisation cannot be suspended or cancelled';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_prevent_platform_org_suspension ON public.organisations;
CREATE TRIGGER trg_prevent_platform_org_suspension
BEFORE INSERT OR UPDATE ON public.organisations
FOR EACH ROW EXECUTE FUNCTION public.prevent_platform_org_suspension();

CREATE TABLE IF NOT EXISTS public.org_status_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  old_status text, new_status text NOT NULL,
  reason text, message text,
  source text NOT NULL DEFAULT 'manual',
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_status_log_org_id ON public.org_status_log(org_id, changed_at DESC);
GRANT SELECT ON public.org_status_log TO authenticated;
GRANT ALL ON public.org_status_log TO service_role;
ALTER TABLE public.org_status_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'platform_admin'::public.app_role
      AND org_id = '11111111-1111-1111-1111-111111111111'::uuid
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_active(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN _org_id IS NULL THEN true
    ELSE COALESCE((SELECT status = 'active' FROM public.organisations WHERE id = _org_id), true)
  END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_org_status()
RETURNS TABLE(org_id uuid, org_name text, status text, suspension_message text, suspension_reason text, suspended_at timestamptz, is_platform_admin boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name, o.status, o.suspension_message, o.suspension_reason, o.suspended_at,
         public.is_platform_admin(auth.uid())
  FROM public.organisations o WHERE o.id = public.get_user_org_id() LIMIT 1;
$$;

DROP POLICY IF EXISTS "org_status_log_platform_admin_select" ON public.org_status_log;
CREATE POLICY "org_status_log_platform_admin_select"
ON public.org_status_log FOR SELECT TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::public.app_role))
);

CREATE OR REPLACE FUNCTION public.suspend_organisation(_org_id uuid, _reason text, _message text DEFAULT NULL, _source text DEFAULT 'manual')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old text;
BEGIN
  IF _source NOT IN ('manual','billing','system') THEN RAISE EXCEPTION 'Invalid source: %', _source; END IF;
  IF _org_id = '11111111-1111-1111-1111-111111111111'::uuid THEN RAISE EXCEPTION 'The platform owner organisation cannot be suspended'; END IF;
  IF NOT (public.is_platform_admin(auth.uid()) OR auth.role() = 'service_role') THEN RAISE EXCEPTION 'Only platform admins can suspend organisations'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT status INTO _old FROM public.organisations WHERE id = _org_id FOR UPDATE;
  IF _old IS NULL THEN RAISE EXCEPTION 'Organisation not found'; END IF;
  UPDATE public.organisations
     SET status = 'suspended', suspension_reason = _reason,
         suspension_message = COALESCE(_message, suspension_message),
         suspended_at = now(), suspended_by = auth.uid()
   WHERE id = _org_id;
  INSERT INTO public.org_status_log (org_id, old_status, new_status, reason, message, source, changed_by)
  VALUES (_org_id, _old, 'suspended', _reason, _message, _source, auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.reactivate_organisation(_org_id uuid, _source text DEFAULT 'manual', _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old text;
BEGIN
  IF _source NOT IN ('manual','billing','system') THEN RAISE EXCEPTION 'Invalid source: %', _source; END IF;
  IF NOT (public.is_platform_admin(auth.uid()) OR auth.role() = 'service_role') THEN RAISE EXCEPTION 'Only platform admins can reactivate organisations'; END IF;
  SELECT status INTO _old FROM public.organisations WHERE id = _org_id FOR UPDATE;
  IF _old IS NULL THEN RAISE EXCEPTION 'Organisation not found'; END IF;
  UPDATE public.organisations
     SET status = 'active', suspension_reason = NULL, suspension_message = NULL,
         suspended_at = NULL, suspended_by = NULL,
         reactivated_at = now(), grace_period_ends_at = NULL
   WHERE id = _org_id;
  INSERT INTO public.org_status_log (org_id, old_status, new_status, reason, source, changed_by)
  VALUES (_org_id, _old, 'active', _reason, _source, auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.cancel_organisation(_org_id uuid, _reason text, _source text DEFAULT 'manual')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old text;
BEGIN
  IF _source NOT IN ('manual','billing','system') THEN RAISE EXCEPTION 'Invalid source: %', _source; END IF;
  IF _org_id = '11111111-1111-1111-1111-111111111111'::uuid THEN RAISE EXCEPTION 'The platform owner organisation cannot be cancelled'; END IF;
  IF NOT (public.is_platform_admin(auth.uid()) OR auth.role() = 'service_role') THEN RAISE EXCEPTION 'Only platform admins can cancel organisations'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT status INTO _old FROM public.organisations WHERE id = _org_id FOR UPDATE;
  IF _old IS NULL THEN RAISE EXCEPTION 'Organisation not found'; END IF;
  UPDATE public.organisations
     SET status = 'cancelled', suspension_reason = _reason,
         suspended_at = COALESCE(suspended_at, now()), suspended_by = auth.uid()
   WHERE id = _org_id;
  INSERT INTO public.org_status_log (org_id, old_status, new_status, reason, source, changed_by)
  VALUES (_org_id, _old, 'cancelled', _reason, _source, auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.platform_list_organisations()
RETURNS TABLE(id uuid, name text, slug text, plan text, status text,
  suspension_reason text, suspension_message text, suspended_at timestamptz,
  created_at timestamptz, user_count bigint, job_count bigint, last_activity timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform admin role required'; END IF;
  RETURN QUERY
  SELECT o.id, o.name, o.slug, o.plan, o.status,
         o.suspension_reason, o.suspension_message, o.suspended_at, o.created_at,
         (SELECT count(*) FROM public.organisation_members m WHERE m.org_id = o.id AND m.status = 'active'),
         (SELECT count(*) FROM public.jobs j WHERE j.org_id = o.id),
         GREATEST(
           COALESCE((SELECT max(updated_at) FROM public.jobs WHERE org_id = o.id), o.created_at),
           COALESCE((SELECT max(created_at) FROM public.job_activity_log jal
                      JOIN public.jobs jj ON jj.id = jal.job_id WHERE jj.org_id = o.id), o.created_at)
         )
  FROM public.organisations o ORDER BY o.created_at DESC;
END $$;

DROP FUNCTION IF EXISTS public.resolve_org_by_intake_email(text);
CREATE OR REPLACE FUNCTION public.resolve_org_by_intake_email(_email text)
RETURNS TABLE(org_id uuid, allowed boolean, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id uuid; v_status text;
  v_email text := lower(trim(_email));
  v_count int; v_window timestamptz;
  v_limit constant int := 30; v_window_seconds constant int := 3600;
BEGIN
  SELECT id, status INTO v_org_id, v_status FROM public.organisations WHERE lower(intake_email) = v_email LIMIT 1;
  IF v_org_id IS NULL THEN RETURN QUERY SELECT NULL::uuid, false, NULL::text; RETURN; END IF;
  IF v_status <> 'active' THEN RETURN QUERY SELECT v_org_id, false, v_status; RETURN; END IF;

  INSERT INTO public.po_intake_rate_limit(intake_email, window_start, count, updated_at)
  VALUES (v_email, now(), 1, now())
  ON CONFLICT (intake_email) DO UPDATE
    SET count = CASE WHEN po_intake_rate_limit.window_start < now() - make_interval(secs => v_window_seconds) THEN 1
                     ELSE po_intake_rate_limit.count + 1 END,
        window_start = CASE WHEN po_intake_rate_limit.window_start < now() - make_interval(secs => v_window_seconds) THEN now()
                            ELSE po_intake_rate_limit.window_start END,
        updated_at = now()
  RETURNING count, window_start INTO v_count, v_window;
  RETURN QUERY SELECT v_org_id, (v_count <= v_limit), v_status;
END $$;

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'jobs','job_assignments','job_documents','job_emails','job_signatures',
    'job_visits','job_sheet_responses','job_messages','job_parts','job_remedial_items',
    'job_activity_log','job_schedule','job_site_survey_photos','job_site_surveys',
    'job_photo_checklist_responses',
    'customers','customer_sites','customer_paperwork','customer_documents',
    'sites','assets','asset_documents','asset_service_history',
    'invoices','invoice_line_items','submissions','defects',
    'rams_documents','generic_rams','vehicle_checks','time_clock','notifications',
    'quote_approval_tokens','handover_tokens','customer_sign_off_tokens',
    'installation_handover_tokens','installation_issues','installation_projects',
    'audits','audit_responses','compliance_records','ppm_schedules',
    'field_reports','site_surveys','site_survey_photos','van_stock','stock_transactions',
    'conformity_certificates','fire_log_entries'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('DROP POLICY IF EXISTS "deny_when_org_suspended" ON public.%I', t);
      EXECUTE format($f$
        CREATE POLICY "deny_when_org_suspended" ON public.%I
        AS RESTRICTIVE FOR ALL TO authenticated
        USING (public.is_org_active(public.get_user_org_id()))
        WITH CHECK (public.is_org_active(public.get_user_org_id()))
      $f$, t);
    END IF;
  END LOOP;
END $$;

INSERT INTO public.user_roles (user_id, role, org_id)
SELECT DISTINCT ur.user_id, 'platform_admin'::public.app_role, '11111111-1111-1111-1111-111111111111'::uuid
FROM public.user_roles ur
WHERE ur.role = 'admin'::public.app_role
  AND ur.org_id = '11111111-1111-1111-1111-111111111111'::uuid
ON CONFLICT DO NOTHING;
