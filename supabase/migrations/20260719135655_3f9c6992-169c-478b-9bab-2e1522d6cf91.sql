
-- 1. Engineer documents storage SELECT: add org check + restrict to authenticated
DROP POLICY IF EXISTS "Engineers can view own document files" ON storage.objects;
CREATE POLICY "Engineers can view own document files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'engineer-documents'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND storage_object_org_id(name) = get_user_org_id()
);

-- 2. Vehicle check photo INSERT: add org path check
DROP POLICY IF EXISTS "Engineers can upload their own vehicle check photos" ON storage.objects;
CREATE POLICY "Engineers can upload their own vehicle check photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vehicle-checks'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND storage_object_org_id(name) = get_user_org_id()
);

-- 3. Historic reports INSERT: restrict to admins
DROP POLICY IF EXISTS "Org members insert historic_reports" ON public.historic_reports;
CREATE POLICY "Org admins insert historic_reports"
ON public.historic_reports FOR INSERT TO authenticated
WITH CHECK (
  org_id = get_user_org_id()
  AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role)
);

-- 4. RAMS INSERT: require org_id match and, if job_id set, job in same org
DROP POLICY IF EXISTS "Authenticated can create RAMS" ON public.rams;
CREATE POLICY "Users create RAMS in own org"
ON public.rams FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND org_id = get_user_org_id()
  AND (
    job_id IS NULL
    OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = rams.job_id AND j.org_id = get_user_org_id())
  )
);
