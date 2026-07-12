
-- ============================================================
-- Multi-tenant migration STEP 1
-- ============================================================

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE;

UPDATE public.user_roles
   SET org_id = '11111111-1111-1111-1111-111111111111'
 WHERE org_id IS NULL;

INSERT INTO public.organisation_members (user_id, org_id, role, status)
SELECT DISTINCT ur.user_id,
       '11111111-1111-1111-1111-111111111111'::uuid,
       'engineer',
       'active'
  FROM public.user_roles ur
 WHERE NOT EXISTS (
   SELECT 1 FROM public.organisation_members om
    WHERE om.user_id = ur.user_id
      AND om.org_id  = '11111111-1111-1111-1111-111111111111'
 )
ON CONFLICT (org_id, user_id) DO NOTHING;

ALTER TABLE public.user_roles ALTER COLUMN org_id SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'public.user_roles'::regclass
                AND conname  = 'user_roles_user_id_role_key') THEN
    ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_user_id_role_key;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.user_roles'::regclass
                    AND conname  = 'user_roles_user_role_org_key') THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_user_role_org_key UNIQUE (user_id, role, org_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_roles_user_org_idx
  ON public.user_roles(user_id, org_id);

CREATE OR REPLACE FUNCTION public.has_role_in_org(_user_id uuid, _org_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user_id
       AND role    = _role
       AND org_id  = _org_id
  );
$$;

REVOKE ALL ON FUNCTION public.has_role_in_org(uuid, uuid, public.app_role) FROM public;
GRANT EXECUTE ON FUNCTION public.has_role_in_org(uuid, uuid, public.app_role) TO authenticated, service_role;

-- ============================================================
-- IN-TRANSACTION TESTS using REAL users (user_roles.user_id -> auth.users FK)
-- Fixtures are inserted then deleted; on any failure the whole txn rolls back.
-- ============================================================
DO $test$
DECLARE
  org_a uuid := '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  org_b uuid := '99999999-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  real_admin  uuid;
  real_engnr  uuid;
  ok boolean;
BEGIN
  SELECT user_id INTO real_admin
    FROM public.user_roles
   WHERE role = 'admin'
   LIMIT 1;

  SELECT user_id INTO real_engnr
    FROM public.user_roles
   WHERE role = 'engineer'
     AND user_id <> real_admin
   LIMIT 1;

  IF real_admin IS NULL OR real_engnr IS NULL THEN
    RAISE EXCEPTION 'FAIL: could not find test users (admin=%, engineer=%)', real_admin, real_engnr;
  END IF;

  INSERT INTO public.organisations (id, name, slug)
  VALUES (org_a, 'Test Org A', 'test-org-a-'||substr(gen_random_uuid()::text,1,8)),
         (org_b, 'Test Org B', 'test-org-b-'||substr(gen_random_uuid()::text,1,8));

  -- Give real_admin admin role in org_a, real_engnr engineer role in org_b
  INSERT INTO public.user_roles (user_id, role, org_id) VALUES
    (real_admin, 'admin',    org_a),
    (real_engnr, 'engineer', org_b);

  -- 1. real_admin is admin in org_a
  IF NOT public.has_role_in_org(real_admin, org_a, 'admin') THEN
    RAISE EXCEPTION 'FAIL 1: real_admin should be admin in org_a'; END IF;

  -- 2. real_admin is NOT admin in org_b (cross-org isolation)
  IF public.has_role_in_org(real_admin, org_b, 'admin') THEN
    RAISE EXCEPTION 'FAIL 2: real_admin leaked admin into org_b'; END IF;

  -- 3. real_engnr is engineer in org_b
  IF NOT public.has_role_in_org(real_engnr, org_b, 'engineer') THEN
    RAISE EXCEPTION 'FAIL 3: real_engnr should be engineer in org_b'; END IF;

  -- 4. real_engnr is NOT admin in org_b
  IF public.has_role_in_org(real_engnr, org_b, 'admin') THEN
    RAISE EXCEPTION 'FAIL 4: real_engnr should not be admin in org_b'; END IF;

  -- 5. real_engnr is NOT engineer in org_a
  IF public.has_role_in_org(real_engnr, org_a, 'engineer') THEN
    RAISE EXCEPTION 'FAIL 5: real_engnr leaked engineer into org_a'; END IF;

  -- 6. legacy has_role() still returns true for the real admin (backward compat)
  IF NOT public.has_role(real_admin, 'admin') THEN
    RAISE EXCEPTION 'FAIL 6: legacy has_role broken for real admin'; END IF;

  -- 7. no NULL org_id remain
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'FAIL 7: NULL org_id rows remain'; END IF;

  -- 8. same (user, role) allowed across different orgs
  --    real_admin already has (admin, viva) and (admin, org_a); adding (admin, org_b) must work
  INSERT INTO public.user_roles (user_id, role, org_id) VALUES (real_admin, 'admin', org_b);

  -- Cleanup
  DELETE FROM public.user_roles WHERE org_id IN (org_a, org_b);
  DELETE FROM public.organisations WHERE id IN (org_a, org_b);

  RAISE NOTICE 'STEP 1 TESTS PASSED (8/8)';
END
$test$;
