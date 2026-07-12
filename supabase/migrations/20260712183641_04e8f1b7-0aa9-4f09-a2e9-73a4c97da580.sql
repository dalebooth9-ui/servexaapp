
-- 1) blank-template-pdfs storage bucket: admins only for write/update
DROP POLICY IF EXISTS "Authenticated write blank-template-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update blank-template-pdfs" ON storage.objects;

CREATE POLICY "Admins write blank-template-pdfs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'blank-template-pdfs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update blank-template-pdfs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'blank-template-pdfs' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'blank-template-pdfs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete blank-template-pdfs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'blank-template-pdfs' AND public.has_role(auth.uid(), 'admin'::app_role));

-- 2) customer_notification_log: split policies; SELECT strictly org-scoped
DROP POLICY IF EXISTS "Admins can manage customer_notification_log" ON public.customer_notification_log;

CREATE POLICY "Admins read customer_notification_log in org"
ON public.customer_notification_log FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND job_id IS NOT NULL
  AND job_id IN (SELECT j.id FROM public.jobs j WHERE j.org_id = public.get_user_org_id())
);

CREATE POLICY "Admins insert customer_notification_log"
ON public.customer_notification_log FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update customer_notification_log in org"
ON public.customer_notification_log FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND (job_id IS NULL OR job_id IN (SELECT j.id FROM public.jobs j WHERE j.org_id = public.get_user_org_id()))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND (job_id IS NULL OR job_id IN (SELECT j.id FROM public.jobs j WHERE j.org_id = public.get_user_org_id()))
);

CREATE POLICY "Admins delete customer_notification_log in org"
ON public.customer_notification_log FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND (job_id IS NULL OR job_id IN (SELECT j.id FROM public.jobs j WHERE j.org_id = public.get_user_org_id()))
);

-- 3) organisation_invitations: revoke SELECT on raw token column from client roles
REVOKE SELECT (token) ON public.organisation_invitations FROM authenticated, anon;

-- 4) organisations: revoke SELECT on Stripe IDs from client roles
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.organisations FROM authenticated, anon;

-- 5) rams: replace public SELECT with org-scoped policy (via linked job)
DROP POLICY IF EXISTS "Authenticated can view RAMS" ON public.rams;

CREATE POLICY "Users can view RAMS in their org"
ON public.rams FOR SELECT TO authenticated
USING (
  auth.uid() = created_by
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    job_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = rams.job_id
        AND (j.org_id = public.get_user_org_id() OR j.org_id IS NULL)
    )
  )
);

-- 6) suppressed_emails: allow admins to read for audit
CREATE POLICY "Admins can read suppressed emails"
ON public.suppressed_emails FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 7) Token tables: revoke SELECT on raw `token` column from client roles.
--    Consumption continues via SECURITY DEFINER RPCs (get_handover_token_by_value, etc.).
REVOKE SELECT (token) ON public.handover_tokens FROM authenticated, anon;
REVOKE SELECT (token) ON public.customer_sign_off_tokens FROM authenticated, anon;
REVOKE SELECT (token) ON public.fire_log_tokens FROM authenticated, anon;
REVOKE SELECT (token) ON public.installation_handover_tokens FROM authenticated, anon;
REVOKE SELECT (token) ON public.quote_approval_tokens FROM authenticated, anon;
REVOKE SELECT (token) ON public.customer_portal_tokens FROM authenticated, anon;

-- 8) realtime.messages: add authorization policies so authenticated users
--    can only subscribe/broadcast on channels; unauthenticated users blocked.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='realtime' AND c.relname='messages') THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated can read realtime messages" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated can write realtime messages" ON realtime.messages';
    EXECUTE $p$CREATE POLICY "Authenticated can read realtime messages"
              ON realtime.messages FOR SELECT TO authenticated
              USING (auth.uid() IS NOT NULL)$p$;
    EXECUTE $p$CREATE POLICY "Authenticated can write realtime messages"
              ON realtime.messages FOR INSERT TO authenticated
              WITH CHECK (auth.uid() IS NOT NULL)$p$;
  END IF;
END $$;
