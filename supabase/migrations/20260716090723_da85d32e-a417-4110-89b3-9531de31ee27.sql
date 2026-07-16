-- 1) job_remedial_items: scope admin policy to org
DROP POLICY IF EXISTS "Admins manage all remedial items" ON public.job_remedial_items;
CREATE POLICY "Admins manage all remedial items"
ON public.job_remedial_items
FOR ALL
TO authenticated
USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

-- 2) pending_whatsapp_scans: require insert org_id matches caller
DO $$
DECLARE
  polname text;
BEGIN
  FOR polname IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='pending_whatsapp_scans' AND cmd='INSERT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.pending_whatsapp_scans', polname);
  END LOOP;
END$$;

CREATE POLICY "Admins insert whatsapp scans in their org"
ON public.pending_whatsapp_scans
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_direct(auth.uid())
  AND org_id = public.get_user_org_id()
);

-- 3) storage_backfill_log: scope admin view policy to org
DROP POLICY IF EXISTS "Admins can view backfill log" ON public.storage_backfill_log;
CREATE POLICY "Admins can view backfill log"
ON public.storage_backfill_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND org_id = public.get_user_org_id()
);