
-- Fix cross-org engineer read access by scoping SELECT policies with org_id

-- 1. sites: drop old policy, create org-scoped one
DROP POLICY IF EXISTS "Members can read sites" ON public.sites;
CREATE POLICY "Members can read sites" ON public.sites
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'engineer'::app_role) AND (org_id = get_user_org_id() OR org_id IS NULL))
  );

-- 2. customers
DROP POLICY IF EXISTS "Members can read customers" ON public.customers;
CREATE POLICY "Members can read customers" ON public.customers
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'engineer'::app_role) AND (org_id = get_user_org_id() OR org_id IS NULL))
  );

-- 3. assets
DROP POLICY IF EXISTS "Members can read assets" ON public.assets;
CREATE POLICY "Members can read assets" ON public.assets
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'engineer'::app_role) AND (org_id = get_user_org_id() OR org_id IS NULL))
  );

-- 4. compliance_records
DROP POLICY IF EXISTS "Members can read compliance_records" ON public.compliance_records;
CREATE POLICY "Members can read compliance_records" ON public.compliance_records
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'engineer'::app_role) AND (org_id = get_user_org_id() OR org_id IS NULL))
  );

-- 5. asset_documents (no org_id - join through assets)
DROP POLICY IF EXISTS "Engineers can view asset_documents" ON public.asset_documents;
CREATE POLICY "Engineers can view asset_documents" ON public.asset_documents
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'engineer'::app_role) AND asset_id IN (
      SELECT id FROM public.assets WHERE org_id = get_user_org_id() OR org_id IS NULL
    ))
  );

-- 6. asset_sensors (no org_id - join through assets)
DROP POLICY IF EXISTS "Members can view sensors" ON public.asset_sensors;
CREATE POLICY "Members can view sensors" ON public.asset_sensors
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'engineer'::app_role) AND asset_id IN (
      SELECT id FROM public.assets WHERE org_id = get_user_org_id() OR org_id IS NULL
    ))
  );
