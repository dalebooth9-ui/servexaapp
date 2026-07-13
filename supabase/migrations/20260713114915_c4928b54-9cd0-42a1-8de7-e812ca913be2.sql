
-- Step 3 · Batch 3 — Documents, Submissions, Sheets, Reports
-- Pattern: has_role(user, R) → has_role_in_org(user, effective_org, R)
--          "j.org_id = get_user_org_id() OR j.org_id IS NULL"  → strict "= get_user_org_id()"
-- Service-role and anonymous token paths untouched.

-- =========================
-- submissions (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all submissions" ON public.submissions;
CREATE POLICY "Admins can manage all submissions in org"
  ON public.submissions FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- submission_comments (via submissions→jobs; no direct org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all comments" ON public.submission_comments;
CREATE POLICY "Admins can manage all comments in org"
  ON public.submission_comments FOR ALL TO authenticated
  USING (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.submissions s
      JOIN public.jobs j ON j.id = s.job_id
      WHERE s.id = submission_comments.submission_id
        AND j.org_id = public.get_user_org_id()
    )
  )
  WITH CHECK (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.submissions s
      JOIN public.jobs j ON j.id = s.job_id
      WHERE s.id = submission_comments.submission_id
        AND j.org_id = public.get_user_org_id()
    )
  );

-- =========================
-- job_sheet_responses (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all responses" ON public.job_sheet_responses;
CREATE POLICY "Admins can manage all responses in org"
  ON public.job_sheet_responses FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- job_sheet_templates (has org_id, global fallback allowed via org_id IS NULL for read)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all job_sheet_templates" ON public.job_sheet_templates;
DROP POLICY IF EXISTS "Admins can manage all templates" ON public.job_sheet_templates;
CREATE POLICY "Admins manage templates in org"
  ON public.job_sheet_templates FOR ALL TO authenticated
  USING (
    (org_id IS NULL AND public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin'))
    OR (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  )
  WITH CHECK (
    (org_id IS NULL AND public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin'))
    OR (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  );

-- =========================
-- job_signatures (no direct org_id; via jobs)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all signatures" ON public.job_signatures;
CREATE POLICY "Admins can manage all signatures in org"
  ON public.job_signatures FOR ALL TO authenticated
  USING (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_signatures.job_id AND j.org_id = public.get_user_org_id())
  )
  WITH CHECK (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_signatures.job_id AND j.org_id = public.get_user_org_id())
  );

-- =========================
-- job_documents (via jobs; user_roles subquery instead of has_role)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all job documents" ON public.job_documents;
CREATE POLICY "Admins can manage all job documents in org"
  ON public.job_documents FOR ALL TO authenticated
  USING (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_documents.job_id AND j.org_id = public.get_user_org_id())
  )
  WITH CHECK (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_documents.job_id AND j.org_id = public.get_user_org_id())
  );

-- =========================
-- job_photo_checklists (via jobs)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all job photo checklists" ON public.job_photo_checklists;
CREATE POLICY "Admins manage photo checklists in org"
  ON public.job_photo_checklists FOR ALL TO authenticated
  USING (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_photo_checklists.job_id AND j.org_id = public.get_user_org_id())
  )
  WITH CHECK (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_photo_checklists.job_id AND j.org_id = public.get_user_org_id())
  );

-- =========================
-- job_photo_checklist_responses (via jobs)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all photo responses" ON public.job_photo_checklist_responses;
CREATE POLICY "Admins manage photo responses in org"
  ON public.job_photo_checklist_responses FOR ALL TO authenticated
  USING (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_photo_checklist_responses.job_id AND j.org_id = public.get_user_org_id())
  )
  WITH CHECK (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_photo_checklist_responses.job_id AND j.org_id = public.get_user_org_id())
  );

-- =========================
-- job_site_surveys (via jobs)
-- =========================
DROP POLICY IF EXISTS "Admins manage site surveys in org" ON public.job_site_surveys;
CREATE POLICY "Admins manage job_site_surveys in org"
  ON public.job_site_surveys FOR ALL TO authenticated
  USING (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_site_surveys.job_id AND j.org_id = public.get_user_org_id())
  )
  WITH CHECK (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_site_surveys.job_id AND j.org_id = public.get_user_org_id())
  );

-- =========================
-- job_site_survey_photos (via jobs)
-- =========================
DROP POLICY IF EXISTS "Admins manage all job survey photos" ON public.job_site_survey_photos;
CREATE POLICY "Admins manage job_site_survey_photos in org"
  ON public.job_site_survey_photos FOR ALL TO authenticated
  USING (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_site_survey_photos.job_id AND j.org_id = public.get_user_org_id())
  )
  WITH CHECK (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_site_survey_photos.job_id AND j.org_id = public.get_user_org_id())
  );

-- =========================
-- site_surveys (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins manage all site surveys" ON public.site_surveys;
CREATE POLICY "Admins manage site_surveys in org"
  ON public.site_surveys FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- site_survey_photos (via site_surveys→org_id)
-- =========================
DROP POLICY IF EXISTS "Admins manage all survey photos" ON public.site_survey_photos;
CREATE POLICY "Admins manage site_survey_photos in org"
  ON public.site_survey_photos FOR ALL TO authenticated
  USING (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.site_surveys s WHERE s.id = site_survey_photos.survey_id AND s.org_id = public.get_user_org_id())
  )
  WITH CHECK (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.site_surveys s WHERE s.id = site_survey_photos.survey_id AND s.org_id = public.get_user_org_id())
  );

-- =========================
-- pending_whatsapp_scans (has org_id; uses is_admin_direct)
-- =========================
DROP POLICY IF EXISTS "Admins can view pending scans" ON public.pending_whatsapp_scans;
DROP POLICY IF EXISTS "Admins can update pending scans" ON public.pending_whatsapp_scans;
DROP POLICY IF EXISTS "Admins can delete pending scans" ON public.pending_whatsapp_scans;
CREATE POLICY "Admins view pending scans in org"
  ON public.pending_whatsapp_scans FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins update pending scans in org"
  ON public.pending_whatsapp_scans FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins delete pending scans in org"
  ON public.pending_whatsapp_scans FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
-- (Service-role INSERT policy left untouched.)

-- =========================
-- field_reports (via jobs)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all field reports" ON public.field_reports;
CREATE POLICY "Admins manage field_reports in org"
  ON public.field_reports FOR ALL TO authenticated
  USING (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = field_reports.job_id AND j.org_id = public.get_user_org_id())
  )
  WITH CHECK (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = field_reports.job_id AND j.org_id = public.get_user_org_id())
  );

-- =========================
-- handover_tokens (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins insert handover tokens" ON public.handover_tokens;
DROP POLICY IF EXISTS "Admins update handover tokens" ON public.handover_tokens;
DROP POLICY IF EXISTS "Admins delete handover tokens" ON public.handover_tokens;
CREATE POLICY "Admins insert handover tokens in org"
  ON public.handover_tokens FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins update handover tokens in org"
  ON public.handover_tokens FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins delete handover tokens in org"
  ON public.handover_tokens FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- installation_handover_tokens (via jobs)
-- =========================
DROP POLICY IF EXISTS "Admins insert installation handover tokens" ON public.installation_handover_tokens;
DROP POLICY IF EXISTS "Admins update installation handover tokens" ON public.installation_handover_tokens;
DROP POLICY IF EXISTS "Admins delete installation handover tokens" ON public.installation_handover_tokens;
CREATE POLICY "Admins insert installation_handover_tokens in org"
  ON public.installation_handover_tokens FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = installation_handover_tokens.job_id AND j.org_id = public.get_user_org_id())
  );
CREATE POLICY "Admins update installation_handover_tokens in org"
  ON public.installation_handover_tokens FOR UPDATE TO authenticated
  USING (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = installation_handover_tokens.job_id AND j.org_id = public.get_user_org_id())
  )
  WITH CHECK (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = installation_handover_tokens.job_id AND j.org_id = public.get_user_org_id())
  );
CREATE POLICY "Admins delete installation_handover_tokens in org"
  ON public.installation_handover_tokens FOR DELETE TO authenticated
  USING (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = installation_handover_tokens.job_id AND j.org_id = public.get_user_org_id())
  );

-- =========================
-- quote_approval_tokens (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage quote tokens" ON public.quote_approval_tokens;
DROP POLICY IF EXISTS "Admins can update quote tokens" ON public.quote_approval_tokens;
CREATE POLICY "Admins insert quote tokens in org"
  ON public.quote_approval_tokens FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins update quote tokens in org"
  ON public.quote_approval_tokens FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- fire_log_entries (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins manage fire log entries" ON public.fire_log_entries;
CREATE POLICY "Admins manage fire log entries in org"
  ON public.fire_log_entries FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- fire_log_tokens (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins insert fire log tokens" ON public.fire_log_tokens;
DROP POLICY IF EXISTS "Admins update fire log tokens" ON public.fire_log_tokens;
DROP POLICY IF EXISTS "Admins delete fire log tokens" ON public.fire_log_tokens;
CREATE POLICY "Admins insert fire log tokens in org"
  ON public.fire_log_tokens FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins update fire log tokens in org"
  ON public.fire_log_tokens FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins delete fire log tokens in org"
  ON public.fire_log_tokens FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- conformity_certificates (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all conformity certificates" ON public.conformity_certificates;
CREATE POLICY "Admins manage conformity_certificates in org"
  ON public.conformity_certificates FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- =========================
-- audits (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all audits" ON public.audits;
DROP POLICY IF EXISTS "Engineers can create audits" ON public.audits;
DROP POLICY IF EXISTS "Engineers can update own audits" ON public.audits;
DROP POLICY IF EXISTS "Engineers can view own audits" ON public.audits;
CREATE POLICY "Admins manage audits in org"
  ON public.audits FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Engineers create audits in org"
  ON public.audits FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
    AND auditor_id = auth.uid()
  );
CREATE POLICY "Engineers view own audits in org"
  ON public.audits FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
    AND auditor_id = auth.uid()
  );
CREATE POLICY "Engineers update own audits in org"
  ON public.audits FOR UPDATE TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
    AND auditor_id = auth.uid()
  )
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
    AND auditor_id = auth.uid()
  );

-- =========================
-- audit_responses (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all audit_responses" ON public.audit_responses;
DROP POLICY IF EXISTS "Engineers can manage own audit_responses" ON public.audit_responses;
CREATE POLICY "Admins manage audit_responses in org"
  ON public.audit_responses FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Engineers manage own audit_responses in org"
  ON public.audit_responses FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
    AND audit_id IN (SELECT a.id FROM public.audits a WHERE a.auditor_id = auth.uid())
  )
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
    AND audit_id IN (SELECT a.id FROM public.audits a WHERE a.auditor_id = auth.uid())
  );

-- =========================
-- pre_completion_checklist_items (via jobs)
-- =========================
DROP POLICY IF EXISTS "Admins can manage pre-completion checklist" ON public.pre_completion_checklist_items;
CREATE POLICY "Admins manage pre_completion_checklist_items in org"
  ON public.pre_completion_checklist_items FOR ALL TO authenticated
  USING (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = pre_completion_checklist_items.job_id AND j.org_id = public.get_user_org_id())
  )
  WITH CHECK (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = pre_completion_checklist_items.job_id AND j.org_id = public.get_user_org_id())
  );

-- =========================
-- rams (has org_id)
-- =========================
DROP POLICY IF EXISTS "Admins can delete RAMS" ON public.rams;
DROP POLICY IF EXISTS "Author or admin can update RAMS" ON public.rams;
DROP POLICY IF EXISTS "Users can view RAMS in their org" ON public.rams;
CREATE POLICY "Admins delete RAMS in org"
  ON public.rams FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));
CREATE POLICY "Author or admin update RAMS in org"
  ON public.rams FOR UPDATE TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND (auth.uid() = created_by OR public.has_role_in_org(auth.uid(), org_id, 'admin'))
  )
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (auth.uid() = created_by OR public.has_role_in_org(auth.uid(), org_id, 'admin'))
  );
CREATE POLICY "Users view RAMS in org"
  ON public.rams FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND (
      auth.uid() = created_by
      OR public.has_role_in_org(auth.uid(), org_id, 'admin')
      OR (job_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = rams.job_id AND j.org_id = public.get_user_org_id()))
    )
  );

-- =========================
-- rams_documents (via jobs)
-- =========================
DROP POLICY IF EXISTS "Admins can manage all RAMS documents" ON public.rams_documents;
CREATE POLICY "Admins manage rams_documents in org"
  ON public.rams_documents FOR ALL TO authenticated
  USING (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = rams_documents.job_id AND j.org_id = public.get_user_org_id())
  )
  WITH CHECK (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = rams_documents.job_id AND j.org_id = public.get_user_org_id())
  );

-- =========================
-- generic_rams (via jobs)
-- =========================
DROP POLICY IF EXISTS "Admins manage generic RAMS in their org" ON public.generic_rams;
CREATE POLICY "Admins manage generic_rams in org"
  ON public.generic_rams FOR ALL TO authenticated
  USING (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = generic_rams.job_id AND j.org_id = public.get_user_org_id())
  )
  WITH CHECK (
    public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = generic_rams.job_id AND j.org_id = public.get_user_org_id())
  );

-- =========================
-- import_batches (has org_id) — tighten to has_role_in_org
-- =========================
DROP POLICY IF EXISTS "Admins can view their org import batches" ON public.import_batches;
DROP POLICY IF EXISTS "Admins can insert import batches in their org" ON public.import_batches;
DROP POLICY IF EXISTS "Admins can update their org import batches" ON public.import_batches;
DROP POLICY IF EXISTS "Admins can delete their org import batches" ON public.import_batches;
CREATE POLICY "Admins manage import_batches in org"
  ON public.import_batches FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'));

-- email_send_log & email_unsubscribe_tokens: service-role only — untouched.
