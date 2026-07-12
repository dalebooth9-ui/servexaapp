
-- customer_portal_tokens: drop admin SELECT policy (admins use admin_list_customer_portal_tokens RPC)
DROP POLICY IF EXISTS "Admins can read customer portal tokens" ON public.customer_portal_tokens;

-- customer_sign_off_tokens: replace ALL policy with per-command (no SELECT)
DROP POLICY IF EXISTS "Admins can manage all sign-off tokens" ON public.customer_sign_off_tokens;
CREATE POLICY "Admins can insert sign-off tokens"
  ON public.customer_sign_off_tokens FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND (EXISTS (
    SELECT 1 FROM jobs j WHERE j.id = customer_sign_off_tokens.job_id
      AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))));
CREATE POLICY "Admins can update sign-off tokens"
  ON public.customer_sign_off_tokens FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND (EXISTS (
    SELECT 1 FROM jobs j WHERE j.id = customer_sign_off_tokens.job_id
      AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND (EXISTS (
    SELECT 1 FROM jobs j WHERE j.id = customer_sign_off_tokens.job_id
      AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))));
CREATE POLICY "Admins can delete sign-off tokens"
  ON public.customer_sign_off_tokens FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND (EXISTS (
    SELECT 1 FROM jobs j WHERE j.id = customer_sign_off_tokens.job_id
      AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))));

-- fire_log_tokens: replace ALL with per-command (no SELECT)
DROP POLICY IF EXISTS "Admins manage fire log tokens" ON public.fire_log_tokens;
CREATE POLICY "Admins insert fire log tokens" ON public.fire_log_tokens
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update fire log tokens" ON public.fire_log_tokens
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete fire log tokens" ON public.fire_log_tokens
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- handover_tokens: replace ALL with per-command (no SELECT)
DROP POLICY IF EXISTS "Admins manage handover tokens" ON public.handover_tokens;
CREATE POLICY "Admins insert handover tokens" ON public.handover_tokens
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update handover tokens" ON public.handover_tokens
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete handover tokens" ON public.handover_tokens
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- installation_handover_tokens: replace ALL with per-command (no SELECT)
DROP POLICY IF EXISTS "Admins can manage handover tokens" ON public.installation_handover_tokens;
CREATE POLICY "Admins insert installation handover tokens"
  ON public.installation_handover_tokens FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND (EXISTS (
    SELECT 1 FROM jobs j WHERE j.id = installation_handover_tokens.job_id
      AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))));
CREATE POLICY "Admins update installation handover tokens"
  ON public.installation_handover_tokens FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND (EXISTS (
    SELECT 1 FROM jobs j WHERE j.id = installation_handover_tokens.job_id
      AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND (EXISTS (
    SELECT 1 FROM jobs j WHERE j.id = installation_handover_tokens.job_id
      AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))));
CREATE POLICY "Admins delete installation handover tokens"
  ON public.installation_handover_tokens FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND (EXISTS (
    SELECT 1 FROM jobs j WHERE j.id = installation_handover_tokens.job_id
      AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))));

-- quote_approval_tokens: drop admin SELECT policy
DROP POLICY IF EXISTS "Admins can view quote tokens" ON public.quote_approval_tokens;
