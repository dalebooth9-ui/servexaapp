
-- Step 3 · Batch 4 — Assets, Parts, Stock, Vehicles, Installations

-- =========================
-- assets (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can read assets" ON public.assets;
DROP POLICY IF EXISTS "Admins can insert assets" ON public.assets;
DROP POLICY IF EXISTS "Admins can update assets" ON public.assets;
DROP POLICY IF EXISTS "Admins can delete assets" ON public.assets;
CREATE POLICY "Admins manage assets in org"
  ON public.assets FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Engineers read assets in org"
  ON public.assets FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'engineer'));

-- =========================
-- asset_documents (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all asset_documents" ON public.asset_documents;
DROP POLICY IF EXISTS "Engineers can upload org asset_documents" ON public.asset_documents;
DROP POLICY IF EXISTS "Engineers can view asset_documents" ON public.asset_documents;
CREATE POLICY "Admins manage asset_documents in org"
  ON public.asset_documents FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Engineers view asset_documents in org"
  ON public.asset_documents FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'engineer'));
CREATE POLICY "Engineers upload asset_documents in org"
  ON public.asset_documents FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
    AND uploaded_by = auth.uid()
    AND asset_id IN (SELECT a.id FROM public.assets a WHERE a.org_id = public.get_user_org_id())
  );

-- =========================
-- asset_sensors (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage sensors" ON public.asset_sensors;
DROP POLICY IF EXISTS "Members can view sensors" ON public.asset_sensors;
CREATE POLICY "Admins manage asset_sensors in org"
  ON public.asset_sensors FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Members view asset_sensors in org"
  ON public.asset_sensors FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND (public.has_role_in_org(auth.uid(), org_id, 'admin')
         OR public.has_role_in_org(auth.uid(), org_id, 'engineer'))
  );

-- =========================
-- sensor_readings (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all sensor_readings" ON public.sensor_readings;
DROP POLICY IF EXISTS "Engineers can view org sensor_readings" ON public.sensor_readings;
CREATE POLICY "Admins manage sensor_readings in org"
  ON public.sensor_readings FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Engineers view sensor_readings in org"
  ON public.sensor_readings FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'engineer'));

-- =========================
-- digital_twin_health (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage digital twin health" ON public.digital_twin_health;
DROP POLICY IF EXISTS "Org admins can manage digital_twin_health" ON public.digital_twin_health;
DROP POLICY IF EXISTS "Org members can view digital_twin_health" ON public.digital_twin_health;
CREATE POLICY "Admins manage digital_twin_health in org"
  ON public.digital_twin_health FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Members view digital_twin_health in org"
  ON public.digital_twin_health FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND (public.has_role_in_org(auth.uid(), org_id, 'admin')
         OR public.has_role_in_org(auth.uid(), org_id, 'engineer'))
  );

-- =========================
-- defects (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can delete defects" ON public.defects;
DROP POLICY IF EXISTS "Admins can update defects" ON public.defects;
DROP POLICY IF EXISTS "Admins can view org defects" ON public.defects;
DROP POLICY IF EXISTS "Engineers can view relevant defects" ON public.defects;
CREATE POLICY "Admins delete defects in org"
  ON public.defects FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins update defects in org"
  ON public.defects FOR UPDATE TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND (public.has_role_in_org(auth.uid(), org_id, 'admin') OR reported_by = auth.uid())
  )
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (public.has_role_in_org(auth.uid(), org_id, 'admin') OR reported_by = auth.uid())
  );
CREATE POLICY "Admins view defects in org"
  ON public.defects FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'admin')
  );
CREATE POLICY "Engineers view relevant defects in org"
  ON public.defects FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
    AND (
      reported_by = auth.uid()
      OR (job_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.job_assignments ja
          WHERE ja.job_id = defects.job_id AND ja.engineer_id = auth.uid()
      ))
    )
  );

-- =========================
-- ppm_schedules (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all PPM schedules" ON public.ppm_schedules;
DROP POLICY IF EXISTS "Admins can manage all ppm_schedules" ON public.ppm_schedules;
DROP POLICY IF EXISTS "Engineers can view org ppm_schedules" ON public.ppm_schedules;
CREATE POLICY "Admins manage ppm_schedules in org"
  ON public.ppm_schedules FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Engineers view ppm_schedules in org"
  ON public.ppm_schedules FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'engineer'));

-- =========================
-- compliance_records (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can read compliance_records" ON public.compliance_records;
DROP POLICY IF EXISTS "Admins can insert compliance_records" ON public.compliance_records;
DROP POLICY IF EXISTS "Admins can update compliance_records" ON public.compliance_records;
DROP POLICY IF EXISTS "Admins can delete compliance_records" ON public.compliance_records;
CREATE POLICY "Admins manage compliance_records in org"
  ON public.compliance_records FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- van_stock (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins delete van stock" ON public.van_stock;
DROP POLICY IF EXISTS "Admins or self insert van stock" ON public.van_stock;
DROP POLICY IF EXISTS "Engineers update own van stock" ON public.van_stock;
DROP POLICY IF EXISTS "Engineers view own van stock" ON public.van_stock;
CREATE POLICY "Admins delete van_stock in org"
  ON public.van_stock FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Insert van_stock in org"
  ON public.van_stock FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (engineer_id = auth.uid() OR public.has_role_in_org(auth.uid(), org_id, 'admin'))
  );
CREATE POLICY "Update van_stock in org"
  ON public.van_stock FOR UPDATE TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND (engineer_id = auth.uid() OR public.has_role_in_org(auth.uid(), org_id, 'admin'))
  )
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (engineer_id = auth.uid() OR public.has_role_in_org(auth.uid(), org_id, 'admin'))
  );
CREATE POLICY "View van_stock in org"
  ON public.van_stock FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND (engineer_id = auth.uid() OR public.has_role_in_org(auth.uid(), org_id, 'admin'))
  );

-- =========================
-- stock_transactions (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins delete stock tx" ON public.stock_transactions;
DROP POLICY IF EXISTS "Admins update stock tx" ON public.stock_transactions;
DROP POLICY IF EXISTS "Engineers insert own stock tx" ON public.stock_transactions;
DROP POLICY IF EXISTS "Engineers view own stock tx" ON public.stock_transactions;
CREATE POLICY "Admins delete stock_transactions in org"
  ON public.stock_transactions FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins update stock_transactions in org"
  ON public.stock_transactions FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Insert stock_transactions in org"
  ON public.stock_transactions FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (engineer_id = auth.uid() OR public.has_role_in_org(auth.uid(), org_id, 'admin'))
  );
CREATE POLICY "View stock_transactions in org"
  ON public.stock_transactions FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND (engineer_id = auth.uid() OR public.has_role_in_org(auth.uid(), org_id, 'admin'))
  );

-- =========================
-- parts_library (has org_id — org rows and global (NULL) rows)
-- =========================
DROP POLICY IF EXISTS "Admins can manage parts library" ON public.parts_library;
DROP POLICY IF EXISTS "Admins can read parts_library" ON public.parts_library;
DROP POLICY IF EXISTS "Org admins can delete parts_library" ON public.parts_library;
DROP POLICY IF EXISTS "Org admins can insert parts_library" ON public.parts_library;
DROP POLICY IF EXISTS "Org admins can update parts_library" ON public.parts_library;
CREATE POLICY "Admins read parts_library (org + global)"
  ON public.parts_library FOR SELECT TO authenticated
  USING (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND (org_id IS NULL OR org_id = public.get_user_org_id())
  );
CREATE POLICY "Admins insert parts_library in org"
  ON public.parts_library FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND org_id = public.get_user_org_id()
  );
CREATE POLICY "Admins update parts_library in org"
  ON public.parts_library FOR UPDATE TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'admin')
  )
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'admin')
  );
CREATE POLICY "Admins delete parts_library in org"
  ON public.parts_library FOR DELETE TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'admin')
  );
-- Engineers get read via existing policies (any FOR ALL admin fully replaced; engineers read via jobs/parts UI queries with their own policy retained if pre-existing).

-- =========================
-- job_parts (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all job parts" ON public.job_parts;
CREATE POLICY "Admins manage job_parts in org"
  ON public.job_parts FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- installation_projects (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all installation projects" ON public.installation_projects;
DROP POLICY IF EXISTS "Admins can manage all installation_projects" ON public.installation_projects;
CREATE POLICY "Admins manage installation_projects in org"
  ON public.installation_projects FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- installation_issues (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all installation issues" ON public.installation_issues;
CREATE POLICY "Admins manage installation_issues in org"
  ON public.installation_issues FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- installation_issue_history (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage issue history" ON public.installation_issue_history;
CREATE POLICY "Admins manage installation_issue_history in org"
  ON public.installation_issue_history FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- installation_issue_photos (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all issue photos" ON public.installation_issue_photos;
CREATE POLICY "Admins manage installation_issue_photos in org"
  ON public.installation_issue_photos FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- vehicles (has org_id) — close cross-tenant read leak
-- =========================
DROP POLICY IF EXISTS "Authenticated can view vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated can add vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can delete vehicles" ON public.vehicles;
CREATE POLICY "View vehicles in org"
  ON public.vehicles FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());
CREATE POLICY "Add vehicles in org"
  ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'admin')
  );
CREATE POLICY "Admins update vehicles in org"
  ON public.vehicles FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins delete vehicles in org"
  ON public.vehicles FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- vehicle_checks (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage vehicle checks" ON public.vehicle_checks;
DROP POLICY IF EXISTS "Engineers can view their own vehicle checks" ON public.vehicle_checks;
DROP POLICY IF EXISTS "Engineers can insert their own vehicle checks" ON public.vehicle_checks;
CREATE POLICY "Admins manage vehicle_checks in org"
  ON public.vehicle_checks FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Engineers view own vehicle_checks in org"
  ON public.vehicle_checks FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id() AND auth.uid() = engineer_id);
CREATE POLICY "Engineers insert own vehicle_checks in org"
  ON public.vehicle_checks FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id() AND auth.uid() = engineer_id);

-- ai_wizard_conversations: policies are already auth.uid()-scoped user-owned — no change needed.
