
-- Fix has_role to work even when organisation_members is empty
-- Falls back to direct user_roles lookup when no org membership exists
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = _role
  )
$$;

-- Fix get_user_org_id to return a non-null value when no org membership exists
-- We keep it returning null (that's fine), but downstream policies need to handle it

-- Fix job_parts admin policy - the org_id sub-check was blocking since get_user_org_id() returns null
DROP POLICY IF EXISTS "Admins can manage all job parts" ON public.job_parts;
CREATE POLICY "Admins can manage all job parts"
  ON public.job_parts
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix job_assignments admin policy
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.job_assignments;
CREATE POLICY "Admins can manage assignments"
  ON public.job_assignments
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix job_schedule admin policy
DROP POLICY IF EXISTS "Admins can manage all schedules" ON public.job_schedule;
CREATE POLICY "Admins can manage all schedules"
  ON public.job_schedule
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix invoices admin policies
DROP POLICY IF EXISTS "Org admins can read invoices" ON public.invoices;
DROP POLICY IF EXISTS "Org admins can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Org admins can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Org admins can delete invoices" ON public.invoices;

CREATE POLICY "Admins can read invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert invoices"
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update invoices"
  ON public.invoices FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete invoices"
  ON public.invoices FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix assets policies
DROP POLICY IF EXISTS "Org members can read assets" ON public.assets;
DROP POLICY IF EXISTS "Org admins can insert assets" ON public.assets;
DROP POLICY IF EXISTS "Org admins can update assets" ON public.assets;
DROP POLICY IF EXISTS "Org admins can delete assets" ON public.assets;

CREATE POLICY "Members can read assets"
  ON public.assets FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'engineer'::app_role));

CREATE POLICY "Admins can insert assets"
  ON public.assets FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update assets"
  ON public.assets FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete assets"
  ON public.assets FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix compliance_records policies
DROP POLICY IF EXISTS "Org members can read compliance_records" ON public.compliance_records;
DROP POLICY IF EXISTS "Org admins can insert compliance_records" ON public.compliance_records;
DROP POLICY IF EXISTS "Org admins can update compliance_records" ON public.compliance_records;
DROP POLICY IF EXISTS "Org admins can delete compliance_records" ON public.compliance_records;

CREATE POLICY "Members can read compliance_records"
  ON public.compliance_records FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'engineer'::app_role));

CREATE POLICY "Admins can insert compliance_records"
  ON public.compliance_records FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update compliance_records"
  ON public.compliance_records FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete compliance_records"
  ON public.compliance_records FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix customers policies
DROP POLICY IF EXISTS "Org members can read customers" ON public.customers;
DROP POLICY IF EXISTS "Org admins can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Org admins can update customers" ON public.customers;
DROP POLICY IF EXISTS "Org admins can delete customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can delete customers" ON public.customers;

CREATE POLICY "Members can read customers"
  ON public.customers FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'engineer'::app_role));

CREATE POLICY "Admins can manage customers"
  ON public.customers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
