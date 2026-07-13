
-- customer_portal_tokens: split ALL policy so admins can write metadata but cannot SELECT raw tokens via client API
DROP POLICY IF EXISTS "Org admins manage customer_portal_tokens" ON public.customer_portal_tokens;
CREATE POLICY "Org admins insert customer_portal_tokens" ON public.customer_portal_tokens
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "Org admins update customer_portal_tokens" ON public.customer_portal_tokens
  FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "Org admins delete customer_portal_tokens" ON public.customer_portal_tokens
  FOR DELETE TO authenticated
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

-- customer_sign_off_tokens: same split — no direct SELECT of raw token
DROP POLICY IF EXISTS "Org admins manage customer_sign_off_tokens" ON public.customer_sign_off_tokens;
CREATE POLICY "Org admins update customer_sign_off_tokens" ON public.customer_sign_off_tokens
  FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "Org admins delete customer_sign_off_tokens" ON public.customer_sign_off_tokens
  FOR DELETE TO authenticated
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "Org admins insert customer_sign_off_tokens" ON public.customer_sign_off_tokens
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

-- xero_connections: restrict SELECT to admins only (was: any org member)
DROP POLICY IF EXISTS "Members read xero_connections in org" ON public.xero_connections;
CREATE POLICY "Org admins read xero_connections" ON public.xero_connections
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
