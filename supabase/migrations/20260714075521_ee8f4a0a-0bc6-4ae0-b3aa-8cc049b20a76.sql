
-- Helper: assets tied to an engineer's assigned jobs (by asset_id or site_id)
CREATE OR REPLACE FUNCTION public.engineer_can_access_asset(_user_id uuid, _asset_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.job_assignments ja ON ja.job_id = j.id
    WHERE ja.engineer_id = _user_id
      AND (
        j.asset_id = _asset_id
        OR j.site_id = (SELECT a.site_id FROM public.assets a WHERE a.id = _asset_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.engineer_can_access_customer(_user_id uuid, _customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.job_assignments ja ON ja.job_id = j.id
    WHERE ja.engineer_id = _user_id
      AND j.customer_id = _customer_id
  );
$$;

-- asset_documents
DROP POLICY IF EXISTS "Engineers view asset_documents in org" ON public.asset_documents;
CREATE POLICY "Engineers view asset_documents in org"
  ON public.asset_documents FOR SELECT
  USING (
    org_id = get_user_org_id()
    AND has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
    AND public.engineer_can_access_asset(auth.uid(), asset_id)
  );

-- asset_sensors
DROP POLICY IF EXISTS "Members view asset_sensors in org" ON public.asset_sensors;
CREATE POLICY "Members view asset_sensors in org"
  ON public.asset_sensors FOR SELECT
  USING (
    org_id = get_user_org_id()
    AND (
      has_role_in_org(auth.uid(), org_id, 'admin'::app_role)
      OR (
        has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
        AND public.engineer_can_access_asset(auth.uid(), asset_id)
      )
    )
  );

-- sensor_readings
DROP POLICY IF EXISTS "Engineers view sensor_readings in org" ON public.sensor_readings;
CREATE POLICY "Engineers view sensor_readings in org"
  ON public.sensor_readings FOR SELECT
  USING (
    org_id = get_user_org_id()
    AND has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
    AND public.engineer_can_access_asset(auth.uid(), asset_id)
  );

-- digital_twin_health
DROP POLICY IF EXISTS "Members view digital_twin_health in org" ON public.digital_twin_health;
CREATE POLICY "Members view digital_twin_health in org"
  ON public.digital_twin_health FOR SELECT
  USING (
    org_id = get_user_org_id()
    AND (
      has_role_in_org(auth.uid(), org_id, 'admin'::app_role)
      OR (
        has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
        AND public.engineer_can_access_asset(auth.uid(), asset_id)
      )
    )
  );

-- ppm_schedules
DROP POLICY IF EXISTS "Engineers view ppm_schedules in org" ON public.ppm_schedules;
CREATE POLICY "Engineers view ppm_schedules in org"
  ON public.ppm_schedules FOR SELECT
  USING (
    org_id = get_user_org_id()
    AND has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
    AND public.engineer_can_access_asset(auth.uid(), asset_id)
  );

-- customer_documents
DROP POLICY IF EXISTS "Org members view customer_documents" ON public.customer_documents;
CREATE POLICY "Org members view customer_documents"
  ON public.customer_documents FOR SELECT
  USING (
    org_id = get_user_org_id()
    AND (
      has_role_in_org(auth.uid(), org_id, 'admin'::app_role)
      OR (
        has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
        AND public.engineer_can_access_customer(auth.uid(), customer_id)
      )
    )
  );

-- job_messages: restrict engineer UPDATE to their own messages
DROP POLICY IF EXISTS "job_messages_engineer_update_v3" ON public.job_messages;
CREATE POLICY "job_messages_engineer_update_v3"
  ON public.job_messages FOR UPDATE
  USING (
    sender_id = auth.uid()
    AND has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.job_assignments ja
      WHERE ja.job_id = job_messages.job_id AND ja.engineer_id = auth.uid()
    )
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
  );

-- Read-receipt helper so engineers can still mark others' messages as read
CREATE OR REPLACE FUNCTION public.mark_job_message_read(_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _job uuid;
  _org uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT job_id, org_id INTO _job, _org FROM public.job_messages WHERE id = _message_id;
  IF _job IS NULL THEN RETURN; END IF;

  -- Must be admin in org, or an assigned engineer
  IF NOT (
    has_role_in_org(_uid, _org, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.job_assignments ja
      WHERE ja.job_id = _job AND ja.engineer_id = _uid
    )
  ) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  UPDATE public.job_messages
     SET read_by = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(read_by, '{}'::uuid[]) || ARRAY[_uid])))
   WHERE id = _message_id
     AND NOT (_uid = ANY(COALESCE(read_by, '{}'::uuid[])));
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_job_message_read(uuid) TO authenticated;
