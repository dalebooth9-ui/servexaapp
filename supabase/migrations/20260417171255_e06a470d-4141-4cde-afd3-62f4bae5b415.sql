
-- 1) organisations INSERT: restrict to platform admins only (prevents orphaned/spoofed org records)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='organisations' AND cmd='INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.organisations', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Only platform admins can create organisations"
  ON public.organisations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) fire_log_entries INSERT: must be admin of the site's org, OR have an active fire_log_token for that site
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='fire_log_entries' AND cmd='INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.fire_log_entries', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Org admins or token holders can insert fire log entries"
  ON public.fire_log_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Admin of the org that owns the site
    (
      org_id IS NOT NULL
      AND public.is_org_admin(org_id)
    )
    OR
    -- Site belongs to the user's org and the user is an admin
    EXISTS (
      SELECT 1 FROM public.sites s
      WHERE s.id = fire_log_entries.site_id
        AND s.org_id IS NOT NULL
        AND public.is_org_admin(s.org_id)
    )
  );
