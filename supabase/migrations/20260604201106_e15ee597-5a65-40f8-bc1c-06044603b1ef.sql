
-- 1) xero_connections: remove all client-readable policies (tokens accessed only via service role/edge functions)
DROP POLICY IF EXISTS "Admins can manage xero_connections within their org" ON public.xero_connections;
DROP POLICY IF EXISTS "Users can manage own xero connections" ON public.xero_connections;
DROP POLICY IF EXISTS "Users can manage their own xero_connections" ON public.xero_connections;
REVOKE ALL ON public.xero_connections FROM authenticated, anon;
GRANT ALL ON public.xero_connections TO service_role;

-- 2) fire_log_entries: drop overly broad public SELECT policy (access only via get_fire_log_token_by_value RPC)
DROP POLICY IF EXISTS "Public can read entries for sites with active tokens" ON public.fire_log_entries;

-- 3) handover_tokens: drop public UPDATE policy (signing must go through edge function with service role)
DROP POLICY IF EXISTS "Public can sign pending tokens" ON public.handover_tokens;

-- 4) customer_notification_log: drop engineer SELECT exposing customer_email
DROP POLICY IF EXISTS "Engineers can view notification logs for assigned jobs" ON public.customer_notification_log;

-- 5) installation_handover_tokens: replace engineer ALL with INSERT-only; full row access (signature_data, client_email) only for admins
DROP POLICY IF EXISTS "Engineers can manage handover tokens for assigned jobs" ON public.installation_handover_tokens;
CREATE POLICY "Engineers can create handover tokens for assigned jobs"
  ON public.installation_handover_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.job_assignments ja
      WHERE ja.job_id = installation_handover_tokens.job_id
        AND ja.engineer_id = auth.uid()
    )
  );

-- 6) organisations: hide Stripe identifiers from client RLS reads (revoke column SELECT)
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.organisations FROM authenticated, anon;

-- 7) site-survey-media storage bucket: restrict to admins and the uploading user (path scoped to user id prefix)
DROP POLICY IF EXISTS "Authenticated read site-survey-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload site-survey-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update site-survey-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete site-survey-media" ON storage.objects;

CREATE POLICY "Admins or owner read site-survey-media"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'site-survey-media'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR owner = auth.uid()
    )
  );

CREATE POLICY "Authenticated upload own site-survey-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'site-survey-media'
    AND owner = auth.uid()
  );

CREATE POLICY "Admins or owner update site-survey-media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'site-survey-media'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR owner = auth.uid()
    )
  );

CREATE POLICY "Admins or owner delete site-survey-media"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'site-survey-media'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR owner = auth.uid()
    )
  );
