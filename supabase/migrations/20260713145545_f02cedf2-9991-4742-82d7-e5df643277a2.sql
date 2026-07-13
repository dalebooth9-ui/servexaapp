
-- =========================================================================
-- STEP 4: per-org configuration & reference data
-- =========================================================================

-- Sentinel: Viva Fire org id used as backfill / defaults source
-- '11111111-1111-1111-1111-111111111111'

-- -------------------------------------------------------------------------
-- 1) xero_connections: proper per-org uniqueness + read policy
-- -------------------------------------------------------------------------
ALTER TABLE public.xero_connections
  DROP CONSTRAINT IF EXISTS xero_connections_user_id_tenant_id_key;

ALTER TABLE public.xero_connections
  ADD CONSTRAINT xero_connections_org_tenant_key UNIQUE (org_id, tenant_id);

-- Allow members of the org to read connection presence (frontend "Is Xero connected?")
DROP POLICY IF EXISTS "Members read xero_connections in org" ON public.xero_connections;
CREATE POLICY "Members read xero_connections in org"
  ON public.xero_connections
  FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org_id());

-- -------------------------------------------------------------------------
-- 2) Generic trigger to autofill org_id from the caller's org
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.force_org_id_from_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user_org uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    v_user_org := public.get_user_org_id();
    IF v_user_org IS NOT NULL THEN
      NEW.org_id := v_user_org;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- -------------------------------------------------------------------------
-- 3) app_settings: PK -> (org_id, key)
-- -------------------------------------------------------------------------
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE public.app_settings ADD PRIMARY KEY (org_id, key);

DROP TRIGGER IF EXISTS trg_app_settings_org_id ON public.app_settings;
CREATE TRIGGER trg_app_settings_org_id
  BEFORE INSERT ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();

-- -------------------------------------------------------------------------
-- 4) email_from_settings: PK -> (org_id, email_type)
-- -------------------------------------------------------------------------
ALTER TABLE public.email_from_settings DROP CONSTRAINT IF EXISTS email_from_settings_pkey;
ALTER TABLE public.email_from_settings ADD PRIMARY KEY (org_id, email_type);

DROP TRIGGER IF EXISTS trg_email_from_settings_org_id ON public.email_from_settings;
CREATE TRIGGER trg_email_from_settings_org_id
  BEFORE INSERT ON public.email_from_settings
  FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();

-- Also add SELECT policy for members (admins can already ALL)
DROP POLICY IF EXISTS "Members read email_from_settings in org" ON public.email_from_settings;
CREATE POLICY "Members read email_from_settings in org"
  ON public.email_from_settings
  FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org_id());

-- -------------------------------------------------------------------------
-- 5) Reference tables: add org_id, rescope uniqueness + RLS
-- -------------------------------------------------------------------------

-- helper macro-ish: repeat per table
-- job_categories
ALTER TABLE public.job_categories
  ADD COLUMN IF NOT EXISTS org_id uuid NOT NULL
    DEFAULT '11111111-1111-1111-1111-111111111111'::uuid
    REFERENCES public.organisations(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_job_categories_org_id ON public.job_categories(org_id);
ALTER TABLE public.job_categories DROP CONSTRAINT IF EXISTS job_categories_name_key;
ALTER TABLE public.job_categories DROP CONSTRAINT IF EXISTS job_categories_slug_key;
ALTER TABLE public.job_categories
  ADD CONSTRAINT job_categories_org_slug_key UNIQUE (org_id, slug);
ALTER TABLE public.job_categories
  ADD CONSTRAINT job_categories_org_name_key UNIQUE (org_id, name);
DROP POLICY IF EXISTS "Admins can manage job categories" ON public.job_categories;
DROP POLICY IF EXISTS "Authenticated users can view job categories" ON public.job_categories;
CREATE POLICY "Members read job_categories in org" ON public.job_categories
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());
CREATE POLICY "Admins manage job_categories in org" ON public.job_categories
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
DROP TRIGGER IF EXISTS trg_job_categories_org_id ON public.job_categories;
CREATE TRIGGER trg_job_categories_org_id BEFORE INSERT ON public.job_categories
  FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();

-- asset_categories
ALTER TABLE public.asset_categories
  ADD COLUMN IF NOT EXISTS org_id uuid NOT NULL
    DEFAULT '11111111-1111-1111-1111-111111111111'::uuid
    REFERENCES public.organisations(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_asset_categories_org_id ON public.asset_categories(org_id);
ALTER TABLE public.asset_categories DROP CONSTRAINT IF EXISTS asset_categories_slug_key;
ALTER TABLE public.asset_categories
  ADD CONSTRAINT asset_categories_org_slug_key UNIQUE (org_id, slug);
DROP POLICY IF EXISTS "Admins can manage asset categories" ON public.asset_categories;
DROP POLICY IF EXISTS "Authenticated users can view asset categories" ON public.asset_categories;
CREATE POLICY "Members read asset_categories in org" ON public.asset_categories
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());
CREATE POLICY "Admins manage asset_categories in org" ON public.asset_categories
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
DROP TRIGGER IF EXISTS trg_asset_categories_org_id ON public.asset_categories;
CREATE TRIGGER trg_asset_categories_org_id BEFORE INSERT ON public.asset_categories
  FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();

-- audit_categories
ALTER TABLE public.audit_categories
  ADD COLUMN IF NOT EXISTS org_id uuid NOT NULL
    DEFAULT '11111111-1111-1111-1111-111111111111'::uuid
    REFERENCES public.organisations(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_audit_categories_org_id ON public.audit_categories(org_id);
ALTER TABLE public.audit_categories
  ADD CONSTRAINT audit_categories_org_slug_key UNIQUE (org_id, slug);
DROP POLICY IF EXISTS "Admins can manage audit categories" ON public.audit_categories;
DROP POLICY IF EXISTS "Authenticated users can view audit categories" ON public.audit_categories;
CREATE POLICY "Members read audit_categories in org" ON public.audit_categories
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());
CREATE POLICY "Admins manage audit_categories in org" ON public.audit_categories
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
DROP TRIGGER IF EXISTS trg_audit_categories_org_id ON public.audit_categories;
CREATE TRIGGER trg_audit_categories_org_id BEFORE INSERT ON public.audit_categories
  FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();

-- fault_codes
ALTER TABLE public.fault_codes
  ADD COLUMN IF NOT EXISTS org_id uuid NOT NULL
    DEFAULT '11111111-1111-1111-1111-111111111111'::uuid
    REFERENCES public.organisations(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_fault_codes_org_id ON public.fault_codes(org_id);
ALTER TABLE public.fault_codes DROP CONSTRAINT IF EXISTS fault_codes_code_key;
ALTER TABLE public.fault_codes
  ADD CONSTRAINT fault_codes_org_code_key UNIQUE (org_id, code);
DROP POLICY IF EXISTS "Admins can manage fault codes" ON public.fault_codes;
DROP POLICY IF EXISTS "Authenticated users can view fault codes" ON public.fault_codes;
CREATE POLICY "Members read fault_codes in org" ON public.fault_codes
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());
CREATE POLICY "Admins manage fault_codes in org" ON public.fault_codes
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
DROP TRIGGER IF EXISTS trg_fault_codes_org_id ON public.fault_codes;
CREATE TRIGGER trg_fault_codes_org_id BEFORE INSERT ON public.fault_codes
  FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();

-- category_document_templates
ALTER TABLE public.category_document_templates
  ADD COLUMN IF NOT EXISTS org_id uuid NOT NULL
    DEFAULT '11111111-1111-1111-1111-111111111111'::uuid
    REFERENCES public.organisations(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_category_document_templates_org_id ON public.category_document_templates(org_id);
DROP POLICY IF EXISTS "Admins can manage category document templates" ON public.category_document_templates;
DROP POLICY IF EXISTS "Authenticated users can view category document templates" ON public.category_document_templates;
CREATE POLICY "Members read category_document_templates in org" ON public.category_document_templates
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());
CREATE POLICY "Admins manage category_document_templates in org" ON public.category_document_templates
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
DROP TRIGGER IF EXISTS trg_category_document_templates_org_id ON public.category_document_templates;
CREATE TRIGGER trg_category_document_templates_org_id BEFORE INSERT ON public.category_document_templates
  FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();

-- audit_templates
ALTER TABLE public.audit_templates
  ADD COLUMN IF NOT EXISTS org_id uuid NOT NULL
    DEFAULT '11111111-1111-1111-1111-111111111111'::uuid
    REFERENCES public.organisations(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_audit_templates_org_id ON public.audit_templates(org_id);
DROP POLICY IF EXISTS "Admins can manage all audit templates" ON public.audit_templates;
DROP POLICY IF EXISTS "Engineers can view audit templates" ON public.audit_templates;
CREATE POLICY "Members read audit_templates in org" ON public.audit_templates
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());
CREATE POLICY "Admins manage audit_templates in org" ON public.audit_templates
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
DROP TRIGGER IF EXISTS trg_audit_templates_org_id ON public.audit_templates;
CREATE TRIGGER trg_audit_templates_org_id BEFORE INSERT ON public.audit_templates
  FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();

-- audit_template_items: scoped via parent template's org
DROP POLICY IF EXISTS "Admins can manage all template items" ON public.audit_template_items;
DROP POLICY IF EXISTS "Engineers can view template items" ON public.audit_template_items;
CREATE POLICY "Members read audit_template_items in org" ON public.audit_template_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.audit_templates t
             WHERE t.id = audit_template_items.template_id
               AND t.org_id = public.get_user_org_id())
  );
CREATE POLICY "Admins manage audit_template_items in org" ON public.audit_template_items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.audit_templates t
             WHERE t.id = audit_template_items.template_id
               AND t.org_id = public.get_user_org_id()
               AND public.has_role_in_org(auth.uid(), t.org_id, 'admin'::app_role))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.audit_templates t
             WHERE t.id = audit_template_items.template_id
               AND t.org_id = public.get_user_org_id()
               AND public.has_role_in_org(auth.uid(), t.org_id, 'admin'::app_role))
  );

-- photo_checklist_templates
ALTER TABLE public.photo_checklist_templates
  ADD COLUMN IF NOT EXISTS org_id uuid NOT NULL
    DEFAULT '11111111-1111-1111-1111-111111111111'::uuid
    REFERENCES public.organisations(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_photo_checklist_templates_org_id ON public.photo_checklist_templates(org_id);
DROP POLICY IF EXISTS "Admins can manage photo checklist templates" ON public.photo_checklist_templates;
DROP POLICY IF EXISTS "Authenticated users can view photo checklist templates" ON public.photo_checklist_templates;
CREATE POLICY "Members read photo_checklist_templates in org" ON public.photo_checklist_templates
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());
CREATE POLICY "Admins manage photo_checklist_templates in org" ON public.photo_checklist_templates
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
DROP TRIGGER IF EXISTS trg_photo_checklist_templates_org_id ON public.photo_checklist_templates;
CREATE TRIGGER trg_photo_checklist_templates_org_id BEFORE INSERT ON public.photo_checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();

-- photo_checklist_items: scoped via parent template
DROP POLICY IF EXISTS "Admins can manage photo checklist items" ON public.photo_checklist_items;
DROP POLICY IF EXISTS "Authenticated users can view photo checklist items" ON public.photo_checklist_items;
CREATE POLICY "Members read photo_checklist_items in org" ON public.photo_checklist_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.photo_checklist_templates t
             WHERE t.id = photo_checklist_items.template_id
               AND t.org_id = public.get_user_org_id())
  );
CREATE POLICY "Admins manage photo_checklist_items in org" ON public.photo_checklist_items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.photo_checklist_templates t
             WHERE t.id = photo_checklist_items.template_id
               AND t.org_id = public.get_user_org_id()
               AND public.has_role_in_org(auth.uid(), t.org_id, 'admin'::app_role))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.photo_checklist_templates t
             WHERE t.id = photo_checklist_items.template_id
               AND t.org_id = public.get_user_org_id()
               AND public.has_role_in_org(auth.uid(), t.org_id, 'admin'::app_role))
  );

-- job_templates (0 rows today, but scope it now for consistency)
ALTER TABLE public.job_templates
  ADD COLUMN IF NOT EXISTS org_id uuid NOT NULL
    DEFAULT '11111111-1111-1111-1111-111111111111'::uuid
    REFERENCES public.organisations(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_job_templates_org_id ON public.job_templates(org_id);
DROP POLICY IF EXISTS "job_templates_admin_all_v3" ON public.job_templates;
DROP POLICY IF EXISTS "job_templates_authenticated_select_v3" ON public.job_templates;
CREATE POLICY "Members read job_templates in org" ON public.job_templates
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());
CREATE POLICY "Admins manage job_templates in org" ON public.job_templates
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
DROP TRIGGER IF EXISTS trg_job_templates_org_id ON public.job_templates;
CREATE TRIGGER trg_job_templates_org_id BEFORE INSERT ON public.job_templates
  FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();

-- -------------------------------------------------------------------------
-- 6) Seed function: copy Viva Fire's reference set into a new org
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_org_reference_data(
  _new_org_id uuid,
  _source_org_id uuid DEFAULT '11111111-1111-1111-1111-111111111111'::uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_tpl record;
  v_new_tpl_id uuid;
BEGIN
  IF _new_org_id = _source_org_id THEN
    RETURN;
  END IF;

  -- Simple reference tables
  INSERT INTO public.job_categories (org_id, name, slug, sort_order)
    SELECT _new_org_id, name, slug, sort_order
    FROM public.job_categories WHERE org_id = _source_org_id
    ON CONFLICT (org_id, slug) DO NOTHING;

  INSERT INTO public.asset_categories (org_id, name, slug, sort_order)
    SELECT _new_org_id, name, slug, sort_order
    FROM public.asset_categories WHERE org_id = _source_org_id
    ON CONFLICT (org_id, slug) DO NOTHING;

  INSERT INTO public.audit_categories (org_id, name, slug, sort_order)
    SELECT _new_org_id, name, slug, sort_order
    FROM public.audit_categories WHERE org_id = _source_org_id
    ON CONFLICT (org_id, slug) DO NOTHING;

  INSERT INTO public.fault_codes (org_id, code, description, priority)
    SELECT _new_org_id, code, description, priority
    FROM public.fault_codes WHERE org_id = _source_org_id
    ON CONFLICT (org_id, code) DO NOTHING;

  INSERT INTO public.category_document_templates
    (org_id, category_slug, document_type, label, file_url, file_name, description, sort_order, enabled)
    SELECT _new_org_id, category_slug, document_type, label, file_url, file_name, description, sort_order, enabled
    FROM public.category_document_templates WHERE org_id = _source_org_id;

  -- audit_templates + items
  FOR r_tpl IN
    SELECT * FROM public.audit_templates WHERE org_id = _source_org_id
  LOOP
    INSERT INTO public.audit_templates (org_id, name, description, category)
      VALUES (_new_org_id, r_tpl.name, r_tpl.description, r_tpl.category)
      RETURNING id INTO v_new_tpl_id;

    INSERT INTO public.audit_template_items (template_id, question, sort_order, required, item_type)
      SELECT v_new_tpl_id, question, sort_order, required, item_type
      FROM public.audit_template_items WHERE template_id = r_tpl.id;
  END LOOP;

  -- photo_checklist_templates + items
  FOR r_tpl IN
    SELECT * FROM public.photo_checklist_templates WHERE org_id = _source_org_id
  LOOP
    INSERT INTO public.photo_checklist_templates (org_id, name, category, description, is_active)
      VALUES (_new_org_id, r_tpl.name, r_tpl.category, r_tpl.description, r_tpl.is_active)
      RETURNING id INTO v_new_tpl_id;

    INSERT INTO public.photo_checklist_items (template_id, sort_order, item_type, label, description, required)
      SELECT v_new_tpl_id, sort_order, item_type, label, description, required
      FROM public.photo_checklist_items WHERE template_id = r_tpl.id;
  END LOOP;
END;
$$;

-- -------------------------------------------------------------------------
-- 7) Trigger: seed defaults whenever a new organisation is created
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_org_created_seed_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id <> '11111111-1111-1111-1111-111111111111'::uuid THEN
    PERFORM public.seed_org_reference_data(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_seed_reference_data ON public.organisations;
CREATE TRIGGER trg_org_seed_reference_data
  AFTER INSERT ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.on_org_created_seed_defaults();
