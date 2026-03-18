
-- Fix asset_documents policies (sub-select uses get_user_org_id which returns null)
DROP POLICY IF EXISTS "Admins can manage all asset_documents" ON public.asset_documents;
DROP POLICY IF EXISTS "Engineers can view org asset_documents" ON public.asset_documents;

CREATE POLICY "Admins can manage all asset_documents"
  ON public.asset_documents FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view asset_documents"
  ON public.asset_documents FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'engineer'::app_role));

-- Fix asset_sensors policies
DROP POLICY IF EXISTS "Org admins can manage sensors" ON public.asset_sensors;
DROP POLICY IF EXISTS "Org members can view sensors" ON public.asset_sensors;

CREATE POLICY "Admins can manage sensors"
  ON public.asset_sensors FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Members can view sensors"
  ON public.asset_sensors FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'engineer'::app_role));

-- Fix audits policies
DROP POLICY IF EXISTS "Admins can manage all audits" ON public.audits;
DROP POLICY IF EXISTS "Engineers can view org audits" ON public.audits;

CREATE POLICY "Admins can manage all audits"
  ON public.audits FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view audits"
  ON public.audits FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'engineer'::app_role) AND (auditor_id = auth.uid() OR site_id IS NULL));

-- Fix audit_responses policies
DROP POLICY IF EXISTS "Admins can manage all audit_responses" ON public.audit_responses;

CREATE POLICY "Admins can manage all audit_responses"
  ON public.audit_responses FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix sites policies if they use get_user_org_id
DROP POLICY IF EXISTS "Org members can read sites" ON public.sites;
DROP POLICY IF EXISTS "Org admins can manage sites" ON public.sites;
DROP POLICY IF EXISTS "Org admins can delete sites" ON public.sites;
DROP POLICY IF EXISTS "Org admins can update sites" ON public.sites;
DROP POLICY IF EXISTS "Org admins can insert sites" ON public.sites;

CREATE POLICY "Members can read sites"
  ON public.sites FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'engineer'::app_role));

CREATE POLICY "Admins can manage sites"
  ON public.sites FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix jobs policies
DROP POLICY IF EXISTS "Admins can manage all jobs" ON public.jobs;
DROP POLICY IF EXISTS "Org admins can manage all jobs" ON public.jobs;
DROP POLICY IF EXISTS "Org members can view jobs" ON public.jobs;

CREATE POLICY "Admins can manage all jobs"
  ON public.jobs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Keep engineer view policy if it exists, recreate it cleanly
DROP POLICY IF EXISTS "Engineers can view assigned jobs" ON public.jobs;
CREATE POLICY "Engineers can view assigned jobs"
  ON public.jobs FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'engineer'::app_role) AND EXISTS (
      SELECT 1 FROM public.job_assignments ja
      WHERE ja.job_id = jobs.id AND ja.engineer_id = auth.uid()
    )
  );

-- Fix conformity_certificates
DROP POLICY IF EXISTS "Admins can manage all conformity certificates" ON public.conformity_certificates;
CREATE POLICY "Admins can manage all conformity certificates"
  ON public.conformity_certificates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix installation_projects / installation_issues
DROP POLICY IF EXISTS "Admins can manage all installation_projects" ON public.installation_projects;
CREATE POLICY "Admins can manage all installation_projects"
  ON public.installation_projects FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
