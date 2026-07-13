
-- =========================================================================
-- STEP 6: Storage bucket org isolation (policy-based, no file moves)
-- =========================================================================

-- Extract the leading path segment; if it is a UUID that matches a real
-- organisation, that organisation owns the file. Otherwise the file is
-- legacy (pre-multi-tenant) and belongs to Viva Fire (grandfathered).
CREATE OR REPLACE FUNCTION public.storage_object_org_id(_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_seg text;
  v_uuid uuid;
  v_exists boolean;
BEGIN
  IF _name IS NULL OR _name = '' THEN
    RETURN '11111111-1111-1111-1111-111111111111'::uuid;
  END IF;
  first_seg := split_part(_name, '/', 1);
  BEGIN
    v_uuid := first_seg::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN '11111111-1111-1111-1111-111111111111'::uuid;
  END;
  SELECT EXISTS(SELECT 1 FROM public.organisations WHERE id = v_uuid) INTO v_exists;
  IF v_exists THEN
    RETURN v_uuid;
  ELSE
    RETURN '11111111-1111-1111-1111-111111111111'::uuid;
  END IF;
END;
$$;

-- Boolean predicate the RLS policy calls.
CREATE OR REPLACE FUNCTION public.user_can_access_storage_path(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organisation_members
    WHERE user_id = auth.uid()
      AND status = 'active'
      AND org_id = public.storage_object_org_id(_name)
  );
$$;

-- Buckets that carry per-org data and must be isolated. Public branding
-- buckets (customer-logos, templates) are intentionally NOT restricted here.
-- One RESTRICTIVE policy layered on top of the existing permissive policies —
-- existing role/ownership checks still gate the action, this simply narrows
-- to same-org files. Viva Fire members always pass (helper returns Viva id
-- for legacy paths and Viva-prefixed paths alike).

DROP POLICY IF EXISTS storage_org_isolation_select ON storage.objects;
CREATE POLICY storage_org_isolation_select
ON storage.objects AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  bucket_id NOT IN (
    'submissions','asset-documents','customer-paperwork','engineer-documents',
    'installation-photos','po-intake','signatures','site-survey-media',
    'vehicle-checks','blank-template-pdfs'
  )
  OR public.user_can_access_storage_path(name)
);

DROP POLICY IF EXISTS storage_org_isolation_insert ON storage.objects;
CREATE POLICY storage_org_isolation_insert
ON storage.objects AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id NOT IN (
    'submissions','asset-documents','customer-paperwork','engineer-documents',
    'installation-photos','po-intake','signatures','site-survey-media',
    'vehicle-checks','blank-template-pdfs'
  )
  OR public.user_can_access_storage_path(name)
);

DROP POLICY IF EXISTS storage_org_isolation_update ON storage.objects;
CREATE POLICY storage_org_isolation_update
ON storage.objects AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  bucket_id NOT IN (
    'submissions','asset-documents','customer-paperwork','engineer-documents',
    'installation-photos','po-intake','signatures','site-survey-media',
    'vehicle-checks','blank-template-pdfs'
  )
  OR public.user_can_access_storage_path(name)
)
WITH CHECK (
  bucket_id NOT IN (
    'submissions','asset-documents','customer-paperwork','engineer-documents',
    'installation-photos','po-intake','signatures','site-survey-media',
    'vehicle-checks','blank-template-pdfs'
  )
  OR public.user_can_access_storage_path(name)
);

DROP POLICY IF EXISTS storage_org_isolation_delete ON storage.objects;
CREATE POLICY storage_org_isolation_delete
ON storage.objects AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  bucket_id NOT IN (
    'submissions','asset-documents','customer-paperwork','engineer-documents',
    'installation-photos','po-intake','signatures','site-survey-media',
    'vehicle-checks','blank-template-pdfs'
  )
  OR public.user_can_access_storage_path(name)
);

-- =========================================================================
-- STEP 7: Invitation-only signup + org creation flow
-- =========================================================================

-- Preview RPC — UI calls this before submitting to show "valid invite" state.
CREATE OR REPLACE FUNCTION public.preview_invitation_token(_token text)
RETURNS TABLE(org_id uuid, org_name text, email text, role text, expired boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.org_id,
         o.name AS org_name,
         i.email,
         i.role,
         (i.expires_at < now() OR i.accepted_at IS NOT NULL) AS expired
  FROM public.organisation_invitations i
  JOIN public.organisations o ON o.id = i.org_id
  WHERE i.token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.preview_invitation_token(text) TO anon, authenticated;

-- Replace handle_new_user to enforce invite-or-create.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_full_name text := COALESCE(v_meta->>'full_name', '');
  v_token text := NULLIF(v_meta->>'invitation_token', '');
  v_create_org boolean := COALESCE((v_meta->>'create_org')::boolean, false);
  v_org_name text := NULLIF(v_meta->>'org_name', '');
  v_bootstrap boolean := COALESCE((v_meta->>'bootstrap')::boolean, false);
  v_invite RECORD;
  v_new_org_id uuid;
  v_new_slug text;
BEGIN
  -- Always create the profile row first.
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, v_full_name);

  -- Bootstrap escape hatch: internal service-role signups (seed scripts,
  -- direct admin inserts) can pass bootstrap=true to skip invite enforcement.
  IF v_bootstrap THEN
    RETURN NEW;
  END IF;

  -- Path 1: joining via invitation token.
  IF v_token IS NOT NULL THEN
    SELECT * INTO v_invite
    FROM public.organisation_invitations
    WHERE token = v_token
      AND accepted_at IS NULL
      AND expires_at > now()
    LIMIT 1;

    IF v_invite.id IS NULL THEN
      RAISE EXCEPTION 'Invitation token is invalid or expired'
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.organisation_members (org_id, user_id, role, invited_by, invited_email, status)
    VALUES (v_invite.org_id, NEW.id, v_invite.role, v_invite.invited_by, v_invite.email, 'active')
    ON CONFLICT DO NOTHING;

    -- Map invitation role -> user_roles for legacy has_role() checks.
    INSERT INTO public.user_roles (user_id, role, org_id)
    VALUES (
      NEW.id,
      CASE WHEN v_invite.role IN ('owner','admin') THEN 'admin'::app_role
           ELSE 'engineer'::app_role END,
      v_invite.org_id
    )
    ON CONFLICT DO NOTHING;

    UPDATE public.organisation_invitations
    SET accepted_at = now()
    WHERE id = v_invite.id;

    RETURN NEW;
  END IF;

  -- Path 2: creating a brand-new organisation.
  IF v_create_org THEN
    IF v_org_name IS NULL THEN
      RAISE EXCEPTION 'Organisation name is required to create a new organisation'
        USING ERRCODE = 'check_violation';
    END IF;

    v_new_slug := regexp_replace(lower(v_org_name), '[^a-z0-9]+', '-', 'g');
    v_new_slug := trim(both '-' from v_new_slug);
    IF v_new_slug = '' THEN v_new_slug := 'org'; END IF;
    -- Ensure slug uniqueness by appending random suffix if needed.
    IF EXISTS (SELECT 1 FROM public.organisations WHERE slug = v_new_slug) THEN
      v_new_slug := v_new_slug || '-' || substr(gen_random_uuid()::text, 1, 6);
    END IF;

    INSERT INTO public.organisations (name, slug, plan, plan_status, created_by)
    VALUES (v_org_name, v_new_slug, 'trial', 'trialing', NEW.id)
    RETURNING id INTO v_new_org_id;
    -- Seeding trigger (on_org_created_seed_defaults) fires automatically.

    INSERT INTO public.organisation_members (org_id, user_id, role, status)
    VALUES (v_new_org_id, NEW.id, 'owner', 'active');

    INSERT INTO public.user_roles (user_id, role, org_id)
    VALUES (NEW.id, 'admin'::app_role, v_new_org_id);

    RETURN NEW;
  END IF;

  -- Neither invitation nor org creation → reject.
  RAISE EXCEPTION 'Signup requires either an invitation token or organisation creation'
    USING ERRCODE = 'check_violation';
END;
$$;
