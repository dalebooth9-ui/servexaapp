
-- compliance_records: restrict SELECT to admins
DROP POLICY IF EXISTS "Members can read compliance_records" ON public.compliance_records;
CREATE POLICY "Admins can read compliance_records"
ON public.compliance_records FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- job_sheet_templates: remove engineer SELECT
DROP POLICY IF EXISTS "Engineers can view org job_sheet_templates" ON public.job_sheet_templates;

-- parts_library: restrict SELECT to admins, remove engineer INSERT
DROP POLICY IF EXISTS "Org members can read parts_library" ON public.parts_library;
DROP POLICY IF EXISTS "Engineers can add to parts library" ON public.parts_library;
CREATE POLICY "Admins can read parts_library"
ON public.parts_library FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND ((org_id = get_user_org_id()) OR (org_id IS NULL)));

-- audit_logs: restrict SELECT to org admins
DROP POLICY IF EXISTS "Org members can read audit logs" ON public.audit_logs;
CREATE POLICY "Org admins can read audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (is_org_admin(org_id));

-- audits: tighten engineer SELECT to only their own auditor_id
DROP POLICY IF EXISTS "Engineers can view audits" ON public.audits;
CREATE POLICY "Engineers can view own audits"
ON public.audits FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'engineer'::app_role) AND auditor_id = auth.uid());
