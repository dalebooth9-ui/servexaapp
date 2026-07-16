
-- Restrict system/infrastructure tables to service_role only (remove cross-tenant admin reads).

DROP POLICY IF EXISTS "Admins can manage mellor deleted refs" ON public.mellor_deleted_references;
REVOKE ALL ON public.mellor_deleted_references FROM authenticated, anon;
GRANT ALL ON public.mellor_deleted_references TO service_role;
CREATE POLICY "Service role manages mellor deleted refs"
  ON public.mellor_deleted_references
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins can read rate limits" ON public.po_intake_rate_limit;
REVOKE ALL ON public.po_intake_rate_limit FROM authenticated, anon;
GRANT ALL ON public.po_intake_rate_limit TO service_role;
CREATE POLICY "Service role manages po intake rate limits"
  ON public.po_intake_rate_limit
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins can read suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
REVOKE ALL ON public.suppressed_emails FROM authenticated, anon;
GRANT ALL ON public.suppressed_emails TO service_role;
CREATE POLICY "Service role manages suppressed emails"
  ON public.suppressed_emails
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
