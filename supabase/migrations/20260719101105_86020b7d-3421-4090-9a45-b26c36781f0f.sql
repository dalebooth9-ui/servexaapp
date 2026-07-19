CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_full_name text := COALESCE(v_meta->>'full_name', '');
  v_token text := NULLIF(v_meta->>'invitation_token', '');
  v_create_org boolean := COALESCE((v_meta->>'create_org')::boolean, false);
  v_org_name text := NULLIF(v_meta->>'org_name', '');
  v_bootstrap boolean := COALESCE((v_meta->>'bootstrap')::boolean, false);
  v_signup_flow text := NULLIF(v_meta->>'signup_flow', '');
  v_invite RECORD;
  v_new_org_id uuid;
  v_new_slug text;
BEGIN
  -- Always create the profile row first.
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, v_full_name);

  -- Bootstrap escape hatch: internal service-role signups.
  IF v_bootstrap THEN
    RETURN NEW;
  END IF;

  -- Invite-code signup flow: org + membership + roles are provisioned
  -- post-confirmation by the provision-new-org edge function.
  IF v_signup_flow = 'invite_code' THEN
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

  -- Path 2: creating a brand-new organisation via metadata.
  IF v_create_org THEN
    IF v_org_name IS NULL THEN
      RAISE EXCEPTION 'Organisation name is required to create a new organisation'
        USING ERRCODE = 'check_violation';
    END IF;

    v_new_slug := regexp_replace(lower(v_org_name), '[^a-z0-9]+', '-', 'g');
    v_new_slug := trim(both '-' from v_new_slug);
    IF v_new_slug = '' THEN v_new_slug := 'org'; END IF;
    IF EXISTS (SELECT 1 FROM public.organisations WHERE slug = v_new_slug) THEN
      v_new_slug := v_new_slug || '-' || substr(gen_random_uuid()::text, 1, 6);
    END IF;

    INSERT INTO public.organisations (name, slug, plan, plan_status, created_by)
    VALUES (v_org_name, v_new_slug, 'trial', 'trialing', NEW.id)
    RETURNING id INTO v_new_org_id;

    INSERT INTO public.organisation_members (org_id, user_id, role, status)
    VALUES (v_new_org_id, NEW.id, 'owner', 'active');

    INSERT INTO public.user_roles (user_id, role, org_id)
    VALUES (NEW.id, 'admin'::app_role, v_new_org_id);

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Signup requires either an invitation token or organisation creation'
    USING ERRCODE = 'check_violation';
END;
$function$;