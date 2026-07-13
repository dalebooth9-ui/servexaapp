
-- Step 3 · Batch 6 — Config, Profiles, Roles

-- =========================
-- app_settings (has org_id) — was globally readable by any authenticated user
-- =========================
DROP POLICY IF EXISTS "Admins can manage app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can read app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Authenticated can read app_settings" ON public.app_settings;
CREATE POLICY "Admins manage app_settings in org"
  ON public.app_settings FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Members read app_settings in org"
  ON public.app_settings FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

-- =========================
-- email_from_settings (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can view email from settings" ON public.email_from_settings;
DROP POLICY IF EXISTS "Admins can insert email from settings" ON public.email_from_settings;
DROP POLICY IF EXISTS "Admins can update email from settings" ON public.email_from_settings;
DROP POLICY IF EXISTS "Admins can delete email from settings" ON public.email_from_settings;
CREATE POLICY "Admins manage email_from_settings in org"
  ON public.email_from_settings FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- profiles (has org_id) — was cross-tenant readable by any admin
-- =========================
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins view profiles in org"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'admin')
  );
CREATE POLICY "Admins update profiles in org"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'admin')
  )
  WITH CHECK (
    org_id IS NOT NULL
    AND org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'admin')
  );
CREATE POLICY "Admins delete profiles in org"
  ON public.profiles FOR DELETE TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'admin')
  );

-- =========================
-- user_roles (has org_id) — was cross-tenant manageable by any global admin
-- =========================
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins manage user_roles in org"
  ON public.user_roles FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- Global reference tables (asset_categories, audit_categories, audit_templates, audit_template_items,
-- bank_holidays, category_document_templates, fault_codes, job_categories, photo_checklist_items,
-- photo_checklist_templates, mellor_deleted_references) intentionally remain global reference data
-- and are not org-scoped in this migration — flagged for product review.
