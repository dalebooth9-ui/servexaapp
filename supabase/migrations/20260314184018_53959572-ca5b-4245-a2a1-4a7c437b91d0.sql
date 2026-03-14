
-- Fix remaining cross-org RLS issues found in second scan

-- ---------------------------------------------------------------
-- profile_names: already recreated as SECURITY INVOKER view
-- Drop and recreate to ensure it applies
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS public.profile_names;
CREATE VIEW public.profile_names
WITH (security_invoker = on)
AS SELECT user_id, full_name FROM public.profiles;

-- ---------------------------------------------------------------
-- AUDIT RESPONSES: scope via auditor ownership
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can view audit responses" ON public.audit_responses;
DROP POLICY IF EXISTS "Engineers can insert audit responses" ON public.audit_responses;
DROP POLICY IF EXISTS "Engineers can update audit responses" ON public.audit_responses;
DROP POLICY IF EXISTS "Admins can manage all audit responses" ON public.audit_responses;

CREATE POLICY "Admins can manage all audit_responses"
  ON public.audit_responses FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Engineers can manage own audit_responses"
  ON public.audit_responses FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'engineer')
    AND audit_id IN (
      SELECT id FROM public.audits WHERE auditor_id = auth.uid()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'engineer')
    AND audit_id IN (
      SELECT id FROM public.audits WHERE auditor_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------
-- ASSET DOCUMENTS: scope via asset org_id
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can view asset documents" ON public.asset_documents;
DROP POLICY IF EXISTS "Engineers can upload asset documents" ON public.asset_documents;
DROP POLICY IF EXISTS "Admins can manage all asset documents" ON public.asset_documents;

CREATE POLICY "Admins can manage all asset_documents"
  ON public.asset_documents FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Engineers can view org asset_documents"
  ON public.asset_documents FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'engineer')
    AND asset_id IN (
      SELECT id FROM public.assets WHERE org_id = get_user_org_id() OR org_id IS NULL
    )
  );

CREATE POLICY "Engineers can upload org asset_documents"
  ON public.asset_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'engineer')
    AND uploaded_by = auth.uid()
    AND asset_id IN (
      SELECT id FROM public.assets WHERE org_id = get_user_org_id() OR org_id IS NULL
    )
  );

-- ---------------------------------------------------------------
-- AUDITS: scope engineer SELECT via site/asset org
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can view audits" ON public.audits;
DROP POLICY IF EXISTS "Engineers can create audits" ON public.audits;
DROP POLICY IF EXISTS "Engineers can update own audits" ON public.audits;
DROP POLICY IF EXISTS "Admins can manage all audits" ON public.audits;

CREATE POLICY "Admins can manage all audits"
  ON public.audits FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Engineers can view org audits"
  ON public.audits FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'engineer')
    AND (
      auditor_id = auth.uid()
      OR site_id IN (SELECT id FROM public.sites WHERE org_id = get_user_org_id() OR org_id IS NULL)
      OR site_id IS NULL
    )
  );

CREATE POLICY "Engineers can create audits"
  ON public.audits FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'engineer')
    AND auditor_id = auth.uid()
  );

CREATE POLICY "Engineers can update own audits"
  ON public.audits FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'engineer') AND auditor_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'engineer') AND auditor_id = auth.uid());

-- ---------------------------------------------------------------
-- JOB SHEET TEMPLATES: scope to org_id
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can view job sheet templates" ON public.job_sheet_templates;
DROP POLICY IF EXISTS "Admins can manage all job sheet templates" ON public.job_sheet_templates;

CREATE POLICY "Admins can manage all job_sheet_templates"
  ON public.job_sheet_templates FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Engineers can view org job_sheet_templates"
  ON public.job_sheet_templates FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'engineer')
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  );

-- ---------------------------------------------------------------
-- PPM SCHEDULES: scope via asset org_id
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can view ppm schedules" ON public.ppm_schedules;
DROP POLICY IF EXISTS "Admins can manage all ppm schedules" ON public.ppm_schedules;

CREATE POLICY "Admins can manage all ppm_schedules"
  ON public.ppm_schedules FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Engineers can view org ppm_schedules"
  ON public.ppm_schedules FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'engineer')
    AND asset_id IN (
      SELECT id FROM public.assets WHERE org_id = get_user_org_id() OR org_id IS NULL
    )
  );

-- ---------------------------------------------------------------
-- SENSOR READINGS: scope via asset org_id
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can view sensor readings" ON public.sensor_readings;
DROP POLICY IF EXISTS "Admins can manage all sensor readings" ON public.sensor_readings;

CREATE POLICY "Admins can manage all sensor_readings"
  ON public.sensor_readings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Engineers can view org sensor_readings"
  ON public.sensor_readings FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'engineer')
    AND sensor_id IN (
      SELECT s.id FROM public.asset_sensors s
      JOIN public.assets a ON a.id = s.asset_id
      WHERE a.org_id = get_user_org_id() OR a.org_id IS NULL
    )
  );
