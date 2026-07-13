
-- Step 3 · Batch 5 — Finance, HR, Time & Support

-- =========================
-- invoices (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can read invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can delete invoices" ON public.invoices;
CREATE POLICY "Admins manage invoices in org"
  ON public.invoices FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- invoice_line_items (no org_id — via invoices)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all line items" ON public.invoice_line_items;
CREATE POLICY "Admins manage invoice_line_items in org"
  ON public.invoice_line_items FOR ALL TO authenticated
  USING (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_line_items.invoice_id AND i.org_id = public.get_user_org_id())
  )
  WITH CHECK (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_line_items.invoice_id AND i.org_id = public.get_user_org_id())
  );

-- =========================
-- engineer_leave (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all leave" ON public.engineer_leave;
DROP POLICY IF EXISTS "Engineers can request leave" ON public.engineer_leave;
CREATE POLICY "Admins manage engineer_leave in org"
  ON public.engineer_leave FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Engineers request leave in org"
  ON public.engineer_leave FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
    AND engineer_id = auth.uid()
    AND requested_by = auth.uid()
    AND status = 'pending'
  );

-- =========================
-- engineer_documents (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all engineer_documents" ON public.engineer_documents;
DROP POLICY IF EXISTS "Engineers can manage own engineer_documents" ON public.engineer_documents;
CREATE POLICY "Admins manage engineer_documents in org"
  ON public.engineer_documents FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Engineers manage own engineer_documents in org"
  ON public.engineer_documents FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
    AND engineer_id = auth.uid()
  )
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
    AND engineer_id = auth.uid()
  );

-- =========================
-- engineer_page_access (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage engineer page access" ON public.engineer_page_access;
CREATE POLICY "Admins manage engineer_page_access in org"
  ON public.engineer_page_access FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- engineer_onboarding_logs (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage onboarding logs" ON public.engineer_onboarding_logs;
CREATE POLICY "Admins manage engineer_onboarding_logs in org"
  ON public.engineer_onboarding_logs FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- engineer_locations (has org_id) — tighten admin cross-org read
-- =========================
DROP POLICY IF EXISTS "Admins can view all engineer locations" ON public.engineer_locations;
CREATE POLICY "Admins view engineer_locations in org"
  ON public.engineer_locations FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- time_clock (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all clock entries" ON public.time_clock;
CREATE POLICY "Admins manage time_clock in org"
  ON public.time_clock FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- support_tickets (has org_id) — tighten
-- =========================
DROP POLICY IF EXISTS "Admins read tickets in their org" ON public.support_tickets;
DROP POLICY IF EXISTS "Admins update tickets in their org" ON public.support_tickets;
CREATE POLICY "Admins read support_tickets in org"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins update support_tickets in org"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- client_errors (has org_id) — tighten
-- =========================
DROP POLICY IF EXISTS "Admins read errors in their org" ON public.client_errors;
DROP POLICY IF EXISTS "Admins delete errors in their org" ON public.client_errors;
CREATE POLICY "Admins read client_errors in org"
  ON public.client_errors FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins delete client_errors in org"
  ON public.client_errors FOR DELETE TO authenticated
  USING (org_id IS NOT NULL AND org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- organisation_invitations, organisation_members, xero_connections: unchanged (already org-scoped via is_org_admin / user_belongs_to_org / service-role).
