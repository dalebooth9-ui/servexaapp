
-- ============================================================
-- 1. Convert ALL RESTRICTIVE policies to PERMISSIVE
--    by dropping and recreating them without the AS RESTRICTIVE clause
-- ============================================================
DO $$
DECLARE
  pol record;
  create_sql text;
  roles_str text;
  role_name text;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND permissive = 'RESTRICTIVE'
  LOOP
    -- Drop the restrictive policy
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);

    -- Build roles string (handle {public} specially)
    IF pol.roles IS NULL OR pol.roles = '{}' THEN
      roles_str := 'public';
    ELSE
      roles_str := '';
      FOREACH role_name IN ARRAY pol.roles LOOP
        IF roles_str <> '' THEN roles_str := roles_str || ', '; END IF;
        roles_str := roles_str || quote_ident(role_name);
      END LOOP;
    END IF;

    -- Build CREATE POLICY statement (omit AS RESTRICTIVE -> default PERMISSIVE)
    create_sql := format('CREATE POLICY %I ON public.%I', pol.policyname, pol.tablename);
    create_sql := create_sql || ' FOR ' || pol.cmd;
    create_sql := create_sql || ' TO ' || roles_str;

    IF pol.qual IS NOT NULL THEN
      create_sql := create_sql || ' USING (' || pol.qual || ')';
    END IF;

    IF pol.with_check IS NOT NULL THEN
      create_sql := create_sql || ' WITH CHECK (' || pol.with_check || ')';
    END IF;

    EXECUTE create_sql;
  END LOOP;
END $$;

-- ============================================================
-- 2. Fix organisation_invitations SELECT policy:
--    restrict to org admins only so tokens & emails are not
--    exposed to regular org members
-- ============================================================
DROP POLICY IF EXISTS "Org members can view their org invitations" ON public.organisation_invitations;

CREATE POLICY "Org admins can view invitations"
  ON public.organisation_invitations
  FOR SELECT
  TO authenticated
  USING (is_org_admin(org_id));

-- ============================================================
-- 3. Add RLS to profile_names if it is a base table
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'profile_names'
      AND table_type = 'BASE TABLE'
  ) THEN
    EXECUTE 'ALTER TABLE public.profile_names ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can view profile names" ON public.profile_names';
    EXECUTE '
      CREATE POLICY "Authenticated users can view profile names"
      ON public.profile_names
      FOR SELECT
      TO authenticated
      USING (auth.uid() IS NOT NULL)
    ';
  END IF;
END $$;
