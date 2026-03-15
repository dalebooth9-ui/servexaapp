
-- ============================================================
-- Fix cross-org data access: update has_role to verify org membership
-- This makes all existing admin-level RLS policies automatically
-- org-scoped without needing to rewrite each policy individually.
-- ============================================================

-- 1. Replace has_role to also verify that the user belongs to the
--    same organisation as their role assignment, via organisation_members.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.organisation_members om
      ON om.user_id = ur.user_id
      AND om.status = 'active'
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND om.org_id = get_user_org_id()
  )
$$;

-- 2. Fix the jobs admin policy which uses ALL with no org filter on WITH CHECK
DROP POLICY IF EXISTS "Admins can manage all jobs" ON public.jobs;
CREATE POLICY "Admins can manage all jobs" ON public.jobs
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND (org_id = get_user_org_id() OR org_id IS NULL)
  );

-- 3. Fix submissions admin policy (scope via jobs)
DROP POLICY IF EXISTS "Admins can manage all submissions" ON public.submissions;
CREATE POLICY "Admins can manage all submissions" ON public.submissions
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = submissions.job_id
        AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = submissions.job_id
        AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)
    )
  );

-- 4. Fix audits admin policy (scope via site_id)
DROP POLICY IF EXISTS "Admins can manage all audits" ON public.audits;
CREATE POLICY "Admins can manage all audits" ON public.audits
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND (
      site_id IS NULL
      OR site_id IN (SELECT id FROM public.sites WHERE org_id = get_user_org_id() OR org_id IS NULL)
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND (
      site_id IS NULL
      OR site_id IN (SELECT id FROM public.sites WHERE org_id = get_user_org_id() OR org_id IS NULL)
    )
  );

-- 5. Fix audit_responses admin policy (scope via audit)
DROP POLICY IF EXISTS "Admins can manage all audit_responses" ON public.audit_responses;
CREATE POLICY "Admins can manage all audit_responses" ON public.audit_responses
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.audits a
      WHERE a.id = audit_responses.audit_id
        AND (a.site_id IS NULL OR a.site_id IN (SELECT id FROM public.sites WHERE org_id = get_user_org_id() OR org_id IS NULL))
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.audits a
      WHERE a.id = audit_responses.audit_id
        AND (a.site_id IS NULL OR a.site_id IN (SELECT id FROM public.sites WHERE org_id = get_user_org_id() OR org_id IS NULL))
    )
  );

-- 6. Fix conformity_certificates admin policy (scope via job)
DROP POLICY IF EXISTS "Admins can manage all conformity certificates" ON public.conformity_certificates;
CREATE POLICY "Admins can manage all conformity certificates" ON public.conformity_certificates
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = conformity_certificates.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = conformity_certificates.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  );

-- 7. Fix rams_documents admin policy (scope via job)
DROP POLICY IF EXISTS "Admins can manage all RAMS documents" ON public.rams_documents;
CREATE POLICY "Admins can manage all RAMS documents" ON public.rams_documents
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = rams_documents.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = rams_documents.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  );

-- 8. Fix field_reports admin policy (scope via job)
DROP POLICY IF EXISTS "Admins can manage all field reports" ON public.field_reports;
CREATE POLICY "Admins can manage all field reports" ON public.field_reports
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = field_reports.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = field_reports.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  );

-- 9. Fix job_messages admin policy (scope via job)
DROP POLICY IF EXISTS "Admins can manage all job messages" ON public.job_messages;
CREATE POLICY "Admins can manage all job messages" ON public.job_messages
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_messages.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_messages.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  );

-- 10. Fix submission_comments admin policy (scope via submission -> job)
DROP POLICY IF EXISTS "Admins can manage all comments" ON public.submission_comments;
CREATE POLICY "Admins can manage all comments" ON public.submission_comments
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.submissions s JOIN public.jobs j ON j.id = s.job_id
      WHERE s.id = submission_comments.submission_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.submissions s JOIN public.jobs j ON j.id = s.job_id
      WHERE s.id = submission_comments.submission_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)
    )
  );

-- 11. Fix customer_notification_log admin policies (scope via job)
DROP POLICY IF EXISTS "Admins can manage customer_notification_log" ON public.customer_notification_log;
DROP POLICY IF EXISTS "Admins can manage notification logs" ON public.customer_notification_log;
CREATE POLICY "Admins can manage customer_notification_log" ON public.customer_notification_log
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND (job_id IS NULL OR job_id IN (SELECT id FROM public.jobs WHERE org_id = get_user_org_id() OR org_id IS NULL))
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND (job_id IS NULL OR job_id IN (SELECT id FROM public.jobs WHERE org_id = get_user_org_id() OR org_id IS NULL))
  );

-- 12. Fix job_signatures admin policy (scope via job)
DROP POLICY IF EXISTS "Admins can manage all signatures" ON public.job_signatures;
CREATE POLICY "Admins can manage all signatures" ON public.job_signatures
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_signatures.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_signatures.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  );

-- 13. Fix job_parts admin policy (scope via job)
DROP POLICY IF EXISTS "Admins can manage all job parts" ON public.job_parts;
CREATE POLICY "Admins can manage all job parts" ON public.job_parts
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_parts.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_parts.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  );

-- 14. Fix job_documents admin policy (scope via job)
DROP POLICY IF EXISTS "Admins can manage all job documents" ON public.job_documents;
CREATE POLICY "Admins can manage all job documents" ON public.job_documents
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_documents.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_documents.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  );

-- 15. Fix job_visits admin policy (scope via job)
DROP POLICY IF EXISTS "Admins can manage all visits" ON public.job_visits;
CREATE POLICY "Admins can manage all visits" ON public.job_visits
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_visits.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_visits.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  );

-- 16. Fix job_activity_log admin policy (scope via job)
DROP POLICY IF EXISTS "Admins can manage all activity logs" ON public.job_activity_log;
CREATE POLICY "Admins can manage all activity logs" ON public.job_activity_log
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_activity_log.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_activity_log.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  );

-- 17. Fix job_assignments admin policy (scope via job)
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.job_assignments;
CREATE POLICY "Admins can manage assignments" ON public.job_assignments
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_assignments.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_assignments.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL))
  );

-- 18. Fix profiles admin update policy (scope via org membership)
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.user_id = profiles.user_id AND om.org_id = get_user_org_id() AND om.status = 'active'
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.organisation_members om
      WHERE om.user_id = profiles.user_id AND om.org_id = get_user_org_id() AND om.status = 'active'
    )
  );

-- 19. Fix installation projects/issues/photos/history/handover tokens (via job)
DROP POLICY IF EXISTS "Admins can manage all installation projects" ON public.installation_projects;
CREATE POLICY "Admins can manage all installation projects" ON public.installation_projects
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = installation_projects.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = installation_projects.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)));

DROP POLICY IF EXISTS "Admins can manage all installation issues" ON public.installation_issues;
CREATE POLICY "Admins can manage all installation issues" ON public.installation_issues
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.installation_projects ip JOIN public.jobs j ON j.id = ip.job_id WHERE ip.id = installation_issues.project_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.installation_projects ip JOIN public.jobs j ON j.id = ip.job_id WHERE ip.id = installation_issues.project_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)));

DROP POLICY IF EXISTS "Admins can manage all issue photos" ON public.installation_issue_photos;
CREATE POLICY "Admins can manage all issue photos" ON public.installation_issue_photos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.installation_issues ii JOIN public.installation_projects ip ON ip.id = ii.project_id JOIN public.jobs j ON j.id = ip.job_id WHERE ii.id = installation_issue_photos.issue_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.installation_issues ii JOIN public.installation_projects ip ON ip.id = ii.project_id JOIN public.jobs j ON j.id = ip.job_id WHERE ii.id = installation_issue_photos.issue_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)));

DROP POLICY IF EXISTS "Admins can manage issue history" ON public.installation_issue_history;
CREATE POLICY "Admins can manage issue history" ON public.installation_issue_history
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.installation_issues ii JOIN public.installation_projects ip ON ip.id = ii.project_id JOIN public.jobs j ON j.id = ip.job_id WHERE ii.id = installation_issue_history.issue_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.installation_issues ii JOIN public.installation_projects ip ON ip.id = ii.project_id JOIN public.jobs j ON j.id = ip.job_id WHERE ii.id = installation_issue_history.issue_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)));

DROP POLICY IF EXISTS "Admins can manage handover tokens" ON public.installation_handover_tokens;
CREATE POLICY "Admins can manage handover tokens" ON public.installation_handover_tokens
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = installation_handover_tokens.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = installation_handover_tokens.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)));

-- 20. Fix job_photo_checklist_responses and job_photo_checklists (via job)
DROP POLICY IF EXISTS "Admins can manage all photo responses" ON public.job_photo_checklist_responses;
CREATE POLICY "Admins can manage all photo responses" ON public.job_photo_checklist_responses
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_photo_checklist_responses.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_photo_checklist_responses.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)));

DROP POLICY IF EXISTS "Admins can manage all job photo checklists" ON public.job_photo_checklists;
CREATE POLICY "Admins can manage all job photo checklists" ON public.job_photo_checklists
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_photo_checklists.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_photo_checklists.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)));

-- 21. Fix pre_completion_checklist_items admin policy (via job)
DROP POLICY IF EXISTS "Admins can manage pre-completion checklist" ON public.pre_completion_checklist_items;
CREATE POLICY "Admins can manage pre-completion checklist" ON public.pre_completion_checklist_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = pre_completion_checklist_items.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = pre_completion_checklist_items.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)));

-- 22. Fix asset_documents admin policy
DROP POLICY IF EXISTS "Admins can manage all asset_documents" ON public.asset_documents;
CREATE POLICY "Admins can manage all asset_documents" ON public.asset_documents
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND asset_id IN (SELECT id FROM public.assets WHERE org_id = get_user_org_id() OR org_id IS NULL))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND asset_id IN (SELECT id FROM public.assets WHERE org_id = get_user_org_id() OR org_id IS NULL));

-- 23. Fix engineer_documents admin policy (scope via org membership of engineer)
DROP POLICY IF EXISTS "Admins can manage all engineer_documents" ON public.engineer_documents;
CREATE POLICY "Admins can manage all engineer_documents" ON public.engineer_documents
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.organisation_members om WHERE om.user_id = engineer_documents.engineer_id AND om.org_id = get_user_org_id() AND om.status = 'active'))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.organisation_members om WHERE om.user_id = engineer_documents.engineer_id AND om.org_id = get_user_org_id() AND om.status = 'active'));

-- 24. Fix job_sheet_responses admin policy (via job)
DROP POLICY IF EXISTS "Admins can manage all responses" ON public.job_sheet_responses;
CREATE POLICY "Admins can manage all responses" ON public.job_sheet_responses
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_sheet_responses.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_sheet_responses.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)));

-- 25. Fix customer_sign_off_tokens admin policy (via job)
DROP POLICY IF EXISTS "Admins can manage all sign-off tokens" ON public.customer_sign_off_tokens;
CREATE POLICY "Admins can manage all sign-off tokens" ON public.customer_sign_off_tokens
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = customer_sign_off_tokens.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = customer_sign_off_tokens.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)));

-- 26. Fix invoice_line_items admin policy (via invoice)
DROP POLICY IF EXISTS "Admins can manage all line items" ON public.invoice_line_items;
CREATE POLICY "Admins can manage all line items" ON public.invoice_line_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_line_items.invoice_id AND (i.org_id = get_user_org_id() OR i.org_id IS NULL)))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_line_items.invoice_id AND (i.org_id = get_user_org_id() OR i.org_id IS NULL)));
