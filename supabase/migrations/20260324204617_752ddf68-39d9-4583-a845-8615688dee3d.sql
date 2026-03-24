
-- =====================================================
-- FIX: organisations table — consolidate SELECT policies
-- Remove duplicate SELECT policies, keep a single one
-- Stripe fields are already masked in organisations_safe view (used in app code)
-- =====================================================
DROP POLICY IF EXISTS "Members can view their org" ON public.organisations;
DROP POLICY IF EXISTS "Org members can read own organisation" ON public.organisations;

-- Single clean SELECT policy scoped to org members
CREATE POLICY "Org members can read own organisation"
  ON public.organisations FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_org(id));

-- =====================================================
-- FIX: customer_portal_tokens — scope admin access to their org
-- Admins should only see tokens belonging to customers in their own org
-- =====================================================
DROP POLICY IF EXISTS "Admins can manage customer portal tokens" ON public.customer_portal_tokens;

CREATE POLICY "Admins can manage customer portal tokens"
  ON public.customer_portal_tokens FOR ALL
  TO authenticated
  USING (
    public.is_admin_direct(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.customers c
      JOIN public.organisation_members om ON om.org_id = c.org_id
      WHERE c.id = customer_portal_tokens.customer_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    public.is_admin_direct(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.customers c
      JOIN public.organisation_members om ON om.org_id = c.org_id
      WHERE c.id = customer_portal_tokens.customer_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );
