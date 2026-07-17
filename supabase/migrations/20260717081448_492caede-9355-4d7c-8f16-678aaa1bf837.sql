-- =========================================================
-- Public table policies: use has_role_in_org for admin write
-- =========================================================

-- email_branding
DROP POLICY IF EXISTS "Admins manage email_branding in org" ON public.email_branding;
CREATE POLICY "Admins manage email_branding in org"
ON public.email_branding
FOR ALL
TO authenticated
USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

-- engineer_signatures
DROP POLICY IF EXISTS "Admins manage engineer_signatures" ON public.engineer_signatures;
CREATE POLICY "Admins manage engineer_signatures"
ON public.engineer_signatures
FOR ALL
TO authenticated
USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

-- storage_backfill_log
DROP POLICY IF EXISTS "Admins can view backfill log" ON public.storage_backfill_log;
CREATE POLICY "Admins can view backfill log"
ON public.storage_backfill_log
FOR SELECT
TO authenticated
USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

-- pending_whatsapp_scans (INSERT policy used bare is_admin_direct)
DROP POLICY IF EXISTS "Admins insert whatsapp scans in their org" ON public.pending_whatsapp_scans;
CREATE POLICY "Admins insert whatsapp scans in their org"
ON public.pending_whatsapp_scans
FOR INSERT
TO authenticated
WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

-- =========================================================
-- Global reference tables: restrict edits to platform admins
-- =========================================================

DROP POLICY IF EXISTS "Admins manage help articles" ON public.help_articles;
CREATE POLICY "Platform admins manage help articles"
ON public.help_articles
FOR ALL
TO authenticated
USING (public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'::app_role))
WITH CHECK (public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage bank holidays" ON public.bank_holidays;
CREATE POLICY "Platform admins manage bank holidays"
ON public.bank_holidays
FOR ALL
TO authenticated
USING (public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'::app_role))
WITH CHECK (public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'::app_role));

-- =========================================================
-- Storage: installation-photos — org-scoped admin override
-- Path: <org_id>/<engineer_id>/...
-- =========================================================

DROP POLICY IF EXISTS "Scoped view installation photos" ON storage.objects;
CREATE POLICY "Scoped view installation photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'installation-photos'
  AND (
    public.has_role_in_org(auth.uid(), public.storage_object_org_id(name), 'admin'::app_role)
    OR (auth.uid())::text = (storage.foldername(name))[2]
  )
);

DROP POLICY IF EXISTS "Scoped upload installation photos" ON storage.objects;
CREATE POLICY "Scoped upload installation photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'installation-photos'
  AND (
    public.has_role_in_org(auth.uid(), public.storage_object_org_id(name), 'admin'::app_role)
    OR (auth.uid())::text = (storage.foldername(name))[2]
  )
);

DROP POLICY IF EXISTS "Scoped update installation photos" ON storage.objects;
CREATE POLICY "Scoped update installation photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'installation-photos'
  AND (
    public.has_role_in_org(auth.uid(), public.storage_object_org_id(name), 'admin'::app_role)
    OR (auth.uid())::text = (storage.foldername(name))[2]
  )
);

DROP POLICY IF EXISTS "Scoped delete installation photos" ON storage.objects;
CREATE POLICY "Scoped delete installation photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'installation-photos'
  AND (
    public.has_role_in_org(auth.uid(), public.storage_object_org_id(name), 'admin'::app_role)
    OR (auth.uid())::text = (storage.foldername(name))[2]
  )
);

-- =========================================================
-- Storage: submissions — org-scoped admin/engineer checks
-- Assumes org-prefixed paths (buildOrgPathAsync)
-- =========================================================

DROP POLICY IF EXISTS "Admins can delete files" ON storage.objects;
CREATE POLICY "Admins can delete submissions in own org"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'submissions'
  AND public.has_role_in_org(auth.uid(), public.storage_object_org_id(name), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and engineers can upload submissions" ON storage.objects;
CREATE POLICY "Admins and engineers upload submissions in own org"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'submissions'
  AND (
    public.has_role_in_org(auth.uid(), public.storage_object_org_id(name), 'admin'::app_role)
    OR public.has_role_in_org(auth.uid(), public.storage_object_org_id(name), 'engineer'::app_role)
  )
);

DROP POLICY IF EXISTS "Authenticated users can view assigned submission files" ON storage.objects;
CREATE POLICY "Authorised users view submission files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'submissions'
  AND (
    public.has_role_in_org(auth.uid(), public.storage_object_org_id(name), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.submissions s
      JOIN public.job_assignments ja ON s.job_id = ja.job_id
      WHERE ja.engineer_id = auth.uid()
        AND (s.file_url = objects.name OR s.file_url LIKE ('%/' || objects.name))
    )
  )
);

-- =========================================================
-- Storage: customer-logos — drop redundant bare-admin policies
-- (customer_logos_write_scope_* already gate writes by ownership)
-- =========================================================

DROP POLICY IF EXISTS "Admins can delete customer logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update customer logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload customer logos" ON storage.objects;

-- =========================================================
-- Storage: templates — drop redundant bare-admin policy
-- (templates_write_platform_only_* already restrict writes)
-- =========================================================

DROP POLICY IF EXISTS "Admins can manage templates" ON storage.objects;

-- =========================================================
-- Storage: blank-template-pdfs — platform admin only
-- (global template cache, not per-org)
-- =========================================================

DROP POLICY IF EXISTS "Admins delete blank-template-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Admins update blank-template-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Admins write blank-template-pdfs" ON storage.objects;

CREATE POLICY "Platform admins delete blank-template-pdfs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'blank-template-pdfs'
  AND public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'::app_role)
);

CREATE POLICY "Platform admins update blank-template-pdfs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'blank-template-pdfs'
  AND public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'::app_role)
)
WITH CHECK (
  bucket_id = 'blank-template-pdfs'
  AND public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'::app_role)
);

CREATE POLICY "Platform admins write blank-template-pdfs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'blank-template-pdfs'
  AND public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'::app_role)
);