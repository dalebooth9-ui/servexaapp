
-- ============================================================
-- SECURITY FIX: Cross-tenant data isolation
-- Scope RLS policies to the calling user's organisation
-- Only touching tables that have org_id or can be scoped via parent
-- ============================================================

-- ---------------------------------------------------------------
-- CUSTOMERS: scope to org_id
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can view customers" ON public.customers;
DROP POLICY IF EXISTS "Engineers can read customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can manage all customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can view customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Users can view customers" ON public.customers;
DROP POLICY IF EXISTS "Users can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Org members can read customers" ON public.customers;
DROP POLICY IF EXISTS "Org admins can manage customers" ON public.customers;

CREATE POLICY "Org members can read customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'engineer'))
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  );

CREATE POLICY "Org admins can manage customers"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Org admins can update customers"
  ON public.customers FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  )
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Org admins can delete customers"
  ON public.customers FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  );

-- ---------------------------------------------------------------
-- SITES: scope to org_id
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can view sites" ON public.sites;
DROP POLICY IF EXISTS "Engineers can read sites" ON public.sites;
DROP POLICY IF EXISTS "Admins can manage all sites" ON public.sites;
DROP POLICY IF EXISTS "Admins can manage sites" ON public.sites;
DROP POLICY IF EXISTS "Authenticated users can view sites" ON public.sites;
DROP POLICY IF EXISTS "Authenticated users can manage sites" ON public.sites;
DROP POLICY IF EXISTS "Users can view sites" ON public.sites;
DROP POLICY IF EXISTS "Users can manage sites" ON public.sites;
DROP POLICY IF EXISTS "Org members can read sites" ON public.sites;
DROP POLICY IF EXISTS "Org admins can manage sites" ON public.sites;

CREATE POLICY "Org members can read sites"
  ON public.sites FOR SELECT
  TO authenticated
  USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'engineer'))
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  );

CREATE POLICY "Org admins can insert sites"
  ON public.sites FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Org admins can update sites"
  ON public.sites FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  )
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Org admins can delete sites"
  ON public.sites FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  );

-- ---------------------------------------------------------------
-- ASSETS: scope to org_id
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can view assets" ON public.assets;
DROP POLICY IF EXISTS "Admins can manage all assets" ON public.assets;
DROP POLICY IF EXISTS "Org members can read assets" ON public.assets;
DROP POLICY IF EXISTS "Org admins can manage assets" ON public.assets;

CREATE POLICY "Org members can read assets"
  ON public.assets FOR SELECT
  TO authenticated
  USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'engineer'))
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  );

CREATE POLICY "Org admins can insert assets"
  ON public.assets FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Org admins can update assets"
  ON public.assets FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  )
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Org admins can delete assets"
  ON public.assets FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  );

-- ---------------------------------------------------------------
-- COMPLIANCE RECORDS: scope to org_id
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can view compliance records" ON public.compliance_records;
DROP POLICY IF EXISTS "Admins can manage all compliance records" ON public.compliance_records;
DROP POLICY IF EXISTS "Org members can read compliance_records" ON public.compliance_records;
DROP POLICY IF EXISTS "Org admins can manage compliance_records" ON public.compliance_records;

CREATE POLICY "Org members can read compliance_records"
  ON public.compliance_records FOR SELECT
  TO authenticated
  USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'engineer'))
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  );

CREATE POLICY "Org admins can insert compliance_records"
  ON public.compliance_records FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Org admins can update compliance_records"
  ON public.compliance_records FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  )
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Org admins can delete compliance_records"
  ON public.compliance_records FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  );

-- ---------------------------------------------------------------
-- INVOICES: scope to org_id — admins only (financial PII)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage all invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated users can manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "Org admins can manage invoices" ON public.invoices;

CREATE POLICY "Org admins can read invoices"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  );

CREATE POLICY "Org admins can insert invoices"
  ON public.invoices FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Org admins can update invoices"
  ON public.invoices FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  )
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Org admins can delete invoices"
  ON public.invoices FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  );

-- ---------------------------------------------------------------
-- PARTS LIBRARY: scope to org_id
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view parts library" ON public.parts_library;
DROP POLICY IF EXISTS "Admins can manage all parts library entries" ON public.parts_library;
DROP POLICY IF EXISTS "Org members can read parts_library" ON public.parts_library;
DROP POLICY IF EXISTS "Org admins can manage parts_library" ON public.parts_library;

CREATE POLICY "Org members can read parts_library"
  ON public.parts_library FOR SELECT
  TO authenticated
  USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'engineer'))
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  );

CREATE POLICY "Org admins can insert parts_library"
  ON public.parts_library FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Org admins can update parts_library"
  ON public.parts_library FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  )
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Org admins can delete parts_library"
  ON public.parts_library FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  );

-- ---------------------------------------------------------------
-- ASSET SENSORS: scope via asset's org_id
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can view sensors" ON public.asset_sensors;
DROP POLICY IF EXISTS "Admins can manage all sensors" ON public.asset_sensors;

CREATE POLICY "Org members can view sensors"
  ON public.asset_sensors FOR SELECT
  TO authenticated
  USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'engineer'))
    AND asset_id IN (
      SELECT id FROM public.assets WHERE org_id = get_user_org_id() OR org_id IS NULL
    )
  );

CREATE POLICY "Org admins can manage sensors"
  ON public.asset_sensors FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    AND asset_id IN (
      SELECT id FROM public.assets WHERE org_id = get_user_org_id() OR org_id IS NULL
    )
  )
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------
-- DIGITAL TWIN HEALTH: scope via asset's org_id
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can view digital twin health" ON public.digital_twin_health;
DROP POLICY IF EXISTS "Admins can manage all digital twin health" ON public.digital_twin_health;

CREATE POLICY "Org members can view digital_twin_health"
  ON public.digital_twin_health FOR SELECT
  TO authenticated
  USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'engineer'))
    AND asset_id IN (
      SELECT id FROM public.assets WHERE org_id = get_user_org_id() OR org_id IS NULL
    )
  );

CREATE POLICY "Org admins can manage digital_twin_health"
  ON public.digital_twin_health FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    AND asset_id IN (
      SELECT id FROM public.assets WHERE org_id = get_user_org_id() OR org_id IS NULL
    )
  )
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------
-- CUSTOMER DOCUMENTS: scope via customer's org_id
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can view customer documents" ON public.customer_documents;
DROP POLICY IF EXISTS "Admins can manage all customer documents" ON public.customer_documents;

CREATE POLICY "Org members can view customer_documents"
  ON public.customer_documents FOR SELECT
  TO authenticated
  USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'engineer'))
    AND customer_id IN (
      SELECT id FROM public.customers WHERE org_id = get_user_org_id() OR org_id IS NULL
    )
  );

CREATE POLICY "Org admins can manage customer_documents"
  ON public.customer_documents FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    AND customer_id IN (
      SELECT id FROM public.customers WHERE org_id = get_user_org_id() OR org_id IS NULL
    )
  )
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------
-- CUSTOMER SITES: scope via customer's org_id
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can view customer sites" ON public.customer_sites;
DROP POLICY IF EXISTS "Admins can manage all customer sites" ON public.customer_sites;

CREATE POLICY "Org members can view customer_sites"
  ON public.customer_sites FOR SELECT
  TO authenticated
  USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'engineer'))
    AND customer_id IN (
      SELECT id FROM public.customers WHERE org_id = get_user_org_id() OR org_id IS NULL
    )
  );

CREATE POLICY "Org admins can manage customer_sites"
  ON public.customer_sites FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    AND customer_id IN (
      SELECT id FROM public.customers WHERE org_id = get_user_org_id() OR org_id IS NULL
    )
  )
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------
-- ENGINEER ONBOARDING LOGS: admins only (contains sent_to_email)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage engineer onboarding logs" ON public.engineer_onboarding_logs;
DROP POLICY IF EXISTS "Authenticated users can manage engineer onboarding logs" ON public.engineer_onboarding_logs;

CREATE POLICY "Admins can manage engineer_onboarding_logs"
  ON public.engineer_onboarding_logs FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------
-- CUSTOMER NOTIFICATION LOG: admins only (contains customer_email)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage customer notification log" ON public.customer_notification_log;
DROP POLICY IF EXISTS "Authenticated users can manage customer notification log" ON public.customer_notification_log;

CREATE POLICY "Admins can manage customer_notification_log"
  ON public.customer_notification_log FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------
-- XERO CONNECTIONS: admins only (contains tokens)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage xero connections" ON public.xero_connections;
DROP POLICY IF EXISTS "Authenticated users can manage xero connections" ON public.xero_connections;

CREATE POLICY "Admins can manage xero_connections"
  ON public.xero_connections FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------
-- ENGINEER DOCUMENTS: admins + owning engineer only
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Engineers can manage own engineer documents" ON public.engineer_documents;
DROP POLICY IF EXISTS "Admins can manage all engineer documents" ON public.engineer_documents;

CREATE POLICY "Admins can manage all engineer_documents"
  ON public.engineer_documents FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Engineers can manage own engineer_documents"
  ON public.engineer_documents FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'engineer')
    AND engineer_id = auth.uid()
  )
  WITH CHECK (
    has_role(auth.uid(), 'engineer')
    AND engineer_id = auth.uid()
  );

-- ---------------------------------------------------------------
-- profile_names VIEW: recreate with SECURITY INVOKER
-- so caller's RLS context on profiles is enforced
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS public.profile_names;

CREATE VIEW public.profile_names
WITH (security_invoker = on)
AS
  SELECT user_id, full_name
  FROM public.profiles;
