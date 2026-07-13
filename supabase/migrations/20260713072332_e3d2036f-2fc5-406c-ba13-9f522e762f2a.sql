-- Step 3, Batch 2: RLS rewrite for Customers & Sites domain
-- Tables: customers, customer_sites, sites, customer_documents, customer_paperwork,
--         customer_merge_suggestions, customer_notification_log,
--         customer_portal_tokens, customer_sign_off_tokens
-- Pattern: org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, <role>)
-- Preserves existing engineer semantics (assigned-job scope, own-upload scope).
-- Viva Fire: unaffected — all rows already carry the Viva org_id.

-- ============ customers ============
DROP POLICY IF EXISTS "Admins can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can read customers" ON public.customers;

CREATE POLICY "Org admins read customers"
  ON public.customers FOR SELECT
  USING (org_id = public.get_user_org_id()
         AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

CREATE POLICY "Org admins manage customers"
  ON public.customers FOR ALL
  USING (org_id = public.get_user_org_id()
         AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id()
              AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- ============ customer_sites ============
DROP POLICY IF EXISTS "Admins can manage all customer_sites" ON public.customer_sites;
DROP POLICY IF EXISTS "Engineers can view customer_sites" ON public.customer_sites;
DROP POLICY IF EXISTS "Org admins can manage customer_sites" ON public.customer_sites;
DROP POLICY IF EXISTS "Org members can view customer_sites" ON public.customer_sites;

CREATE POLICY "Org members read customer_sites"
  ON public.customer_sites FOR SELECT
  USING (org_id = public.get_user_org_id()
         AND (public.has_role_in_org(auth.uid(), org_id, 'admin')
              OR public.has_role_in_org(auth.uid(), org_id, 'engineer')));

CREATE POLICY "Org admins manage customer_sites"
  ON public.customer_sites FOR ALL
  USING (org_id = public.get_user_org_id()
         AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id()
              AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- ============ sites ============
DROP POLICY IF EXISTS "Admins can manage sites" ON public.sites;
DROP POLICY IF EXISTS "Admins can read sites" ON public.sites;

CREATE POLICY "Org admins read sites"
  ON public.sites FOR SELECT
  USING (org_id = public.get_user_org_id()
         AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

CREATE POLICY "Org admins manage sites"
  ON public.sites FOR ALL
  USING (org_id = public.get_user_org_id()
         AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id()
              AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- ============ customer_documents ============
DROP POLICY IF EXISTS "Engineers can insert customer documents" ON public.customer_documents;
DROP POLICY IF EXISTS "Engineers can update own customer documents" ON public.customer_documents;
DROP POLICY IF EXISTS "Org admins can manage customer_documents" ON public.customer_documents;
DROP POLICY IF EXISTS "Org members can view customer_documents" ON public.customer_documents;

CREATE POLICY "Org members view customer_documents"
  ON public.customer_documents FOR SELECT
  USING (org_id = public.get_user_org_id()
         AND (public.has_role_in_org(auth.uid(), org_id, 'admin')
              OR public.has_role_in_org(auth.uid(), org_id, 'engineer')));

CREATE POLICY "Org admins manage customer_documents"
  ON public.customer_documents FOR ALL
  USING (org_id = public.get_user_org_id()
         AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id()
              AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

CREATE POLICY "Engineers insert customer_documents in org"
  ON public.customer_documents FOR INSERT
  WITH CHECK (org_id = public.get_user_org_id()
              AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
              AND uploaded_by = auth.uid());

CREATE POLICY "Engineers update own customer_documents"
  ON public.customer_documents FOR UPDATE
  USING (org_id = public.get_user_org_id()
         AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
         AND uploaded_by = auth.uid())
  WITH CHECK (org_id = public.get_user_org_id()
              AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
              AND uploaded_by = auth.uid());

-- ============ customer_paperwork ============
DROP POLICY IF EXISTS "Admins can manage all customer paperwork" ON public.customer_paperwork;
DROP POLICY IF EXISTS "Engineers can view customer paperwork" ON public.customer_paperwork;

CREATE POLICY "Org admins manage customer_paperwork"
  ON public.customer_paperwork FOR ALL
  USING (org_id = public.get_user_org_id()
         AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id()
              AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

CREATE POLICY "Engineers view customer_paperwork via assigned jobs"
  ON public.customer_paperwork FOR SELECT
  USING (org_id = public.get_user_org_id()
         AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
         AND EXISTS (
           SELECT 1 FROM public.jobs j
           JOIN public.job_assignments ja ON ja.job_id = j.id
           WHERE j.customer_id = customer_paperwork.customer_id
             AND ja.engineer_id = auth.uid()
         ));

-- ============ customer_merge_suggestions ============
DROP POLICY IF EXISTS "Admins can delete merge suggestions" ON public.customer_merge_suggestions;
DROP POLICY IF EXISTS "Admins can update merge suggestions" ON public.customer_merge_suggestions;
DROP POLICY IF EXISTS "Admins can view merge suggestions" ON public.customer_merge_suggestions;

CREATE POLICY "Org admins manage customer_merge_suggestions"
  ON public.customer_merge_suggestions FOR ALL
  USING (org_id = public.get_user_org_id()
         AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id()
              AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- ============ customer_notification_log ============
DROP POLICY IF EXISTS "Admins delete customer_notification_log in org" ON public.customer_notification_log;
DROP POLICY IF EXISTS "Admins insert customer_notification_log" ON public.customer_notification_log;
DROP POLICY IF EXISTS "Admins read customer_notification_log in org" ON public.customer_notification_log;
DROP POLICY IF EXISTS "Admins update customer_notification_log in org" ON public.customer_notification_log;

CREATE POLICY "Org admins manage customer_notification_log"
  ON public.customer_notification_log FOR ALL
  USING (org_id = public.get_user_org_id()
         AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id()
              AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- ============ customer_portal_tokens ============
DROP POLICY IF EXISTS "Admins manage org tokens (delete)" ON public.customer_portal_tokens;
DROP POLICY IF EXISTS "Admins manage org tokens (insert)" ON public.customer_portal_tokens;
DROP POLICY IF EXISTS "Admins manage org tokens (update)" ON public.customer_portal_tokens;

CREATE POLICY "Org admins manage customer_portal_tokens"
  ON public.customer_portal_tokens FOR ALL
  USING (org_id = public.get_user_org_id()
         AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id()
              AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- Note: anonymous portal validation goes through customer-portal-validate edge function
-- using service role, so no anon policy is needed here.

-- ============ customer_sign_off_tokens ============
DROP POLICY IF EXISTS "Admins can delete sign-off tokens" ON public.customer_sign_off_tokens;
DROP POLICY IF EXISTS "Admins can insert sign-off tokens" ON public.customer_sign_off_tokens;
DROP POLICY IF EXISTS "Admins can update sign-off tokens" ON public.customer_sign_off_tokens;
DROP POLICY IF EXISTS "Admins can view sign-off tokens" ON public.customer_sign_off_tokens;

CREATE POLICY "Org admins manage customer_sign_off_tokens"
  ON public.customer_sign_off_tokens FOR ALL
  USING (org_id = public.get_user_org_id()
         AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id()
              AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- Note: token creation for engineers already routes through the SECURITY DEFINER
-- RPC create_customer_sign_off_token, which validates assignment and bypasses RLS.
