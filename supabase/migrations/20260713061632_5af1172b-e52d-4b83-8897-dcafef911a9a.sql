
-- STEP 3 · BATCH 1 — Jobs & scheduling: enforce org scoping on RLS
-- (job_templates is global — no org_id)

-- jobs
DROP POLICY IF EXISTS "Admins can manage all jobs" ON public.jobs;
DROP POLICY IF EXISTS "Admins can delete jobs" ON public.jobs;
DROP POLICY IF EXISTS "Service role can insert jobs" ON public.jobs;
DROP POLICY IF EXISTS "Engineers can view assigned jobs" ON public.jobs;
DROP POLICY IF EXISTS "Engineers can update assigned jobs" ON public.jobs;

CREATE POLICY "jobs_admin_all_v3" ON public.jobs FOR ALL TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "jobs_service_insert_v3" ON public.jobs FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "jobs_engineer_select_v3" ON public.jobs FOR SELECT TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
    AND EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = jobs.id AND ja.engineer_id = auth.uid()));
CREATE POLICY "jobs_engineer_update_v3" ON public.jobs FOR UPDATE TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
    AND EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = jobs.id AND ja.engineer_id = auth.uid()))
  WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
    AND EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = jobs.id AND ja.engineer_id = auth.uid()));

-- job_visits
DROP POLICY IF EXISTS "Admins can manage all visits" ON public.job_visits;
DROP POLICY IF EXISTS "Engineers can view assigned job visits" ON public.job_visits;
DROP POLICY IF EXISTS "Engineers can update assigned visits" ON public.job_visits;

CREATE POLICY "job_visits_admin_all_v3" ON public.job_visits FOR ALL TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "job_visits_engineer_select_v3" ON public.job_visits FOR SELECT TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
    AND EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = job_visits.job_id AND ja.engineer_id = auth.uid()));
CREATE POLICY "job_visits_engineer_update_v3" ON public.job_visits FOR UPDATE TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'engineer'::app_role) AND engineer_id = auth.uid())
  WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'engineer'::app_role) AND engineer_id = auth.uid());

-- job_assignments
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.job_assignments;
DROP POLICY IF EXISTS "Admins can view all assignments" ON public.job_assignments;
DROP POLICY IF EXISTS "Engineers can view own assignments" ON public.job_assignments;

CREATE POLICY "job_assignments_admin_all_v3" ON public.job_assignments FOR ALL TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "job_assignments_engineer_select_v3" ON public.job_assignments FOR SELECT TO authenticated
  USING (engineer_id = auth.uid() AND public.has_role_in_org(auth.uid(), org_id, 'engineer'::app_role));

-- job_activity_log
DROP POLICY IF EXISTS "Admins can manage all activity logs" ON public.job_activity_log;
DROP POLICY IF EXISTS "Engineers can insert activity logs for assigned jobs" ON public.job_activity_log;
DROP POLICY IF EXISTS "Engineers can view activity logs for assigned jobs" ON public.job_activity_log;

CREATE POLICY "job_activity_log_admin_all_v3" ON public.job_activity_log FOR ALL TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "job_activity_log_engineer_select_v3" ON public.job_activity_log FOR SELECT TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
    AND EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = job_activity_log.job_id AND ja.engineer_id = auth.uid()));
CREATE POLICY "job_activity_log_engineer_insert_v3" ON public.job_activity_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
    AND public.has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
    AND EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = job_activity_log.job_id AND ja.engineer_id = auth.uid()));

-- job_schedule
DROP POLICY IF EXISTS "Admins can manage all schedules" ON public.job_schedule;
DROP POLICY IF EXISTS "Engineers can view own schedule" ON public.job_schedule;

CREATE POLICY "job_schedule_admin_all_v3" ON public.job_schedule FOR ALL TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "job_schedule_engineer_select_v3" ON public.job_schedule FOR SELECT TO authenticated
  USING (engineer_id = auth.uid() AND public.has_role_in_org(auth.uid(), org_id, 'engineer'::app_role));

-- job_messages
DROP POLICY IF EXISTS "Admins can manage all job messages" ON public.job_messages;
DROP POLICY IF EXISTS "Engineers can send messages on assigned jobs" ON public.job_messages;
DROP POLICY IF EXISTS "Engineers can view messages for assigned jobs" ON public.job_messages;
DROP POLICY IF EXISTS "Engineers can update read_by on assigned jobs" ON public.job_messages;

CREATE POLICY "job_messages_admin_all_v3" ON public.job_messages FOR ALL TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "job_messages_engineer_select_v3" ON public.job_messages FOR SELECT TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
    AND EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = job_messages.job_id AND ja.engineer_id = auth.uid()));
CREATE POLICY "job_messages_engineer_insert_v3" ON public.job_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid()
    AND public.has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
    AND EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = job_messages.job_id AND ja.engineer_id = auth.uid()));
CREATE POLICY "job_messages_engineer_update_v3" ON public.job_messages FOR UPDATE TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
    AND EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = job_messages.job_id AND ja.engineer_id = auth.uid()));

-- job_templates (GLOBAL — no org_id; kept as-is with modern naming)
DROP POLICY IF EXISTS "Admins can manage job templates" ON public.job_templates;
DROP POLICY IF EXISTS "Authenticated users can view job templates" ON public.job_templates;

CREATE POLICY "job_templates_admin_all_v3" ON public.job_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "job_templates_authenticated_select_v3" ON public.job_templates FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- job_template_locks
DROP POLICY IF EXISTS "Admins manage all job_template_locks" ON public.job_template_locks;
DROP POLICY IF EXISTS "Engineers can view org job_template_locks" ON public.job_template_locks;

CREATE POLICY "job_template_locks_admin_all_v3" ON public.job_template_locks FOR ALL TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "job_template_locks_engineer_select_v3" ON public.job_template_locks FOR SELECT TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
    AND org_id = public.get_user_org_id());

-- planner_adhoc_entries
DROP POLICY IF EXISTS "Admins can manage adhoc entries" ON public.planner_adhoc_entries;
DROP POLICY IF EXISTS "Engineers can view own adhoc entries" ON public.planner_adhoc_entries;

CREATE POLICY "planner_adhoc_admin_all_v3" ON public.planner_adhoc_entries FOR ALL TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "planner_adhoc_engineer_select_v3" ON public.planner_adhoc_entries FOR SELECT TO authenticated
  USING (engineer_id = auth.uid()
    AND public.has_role_in_org(auth.uid(), org_id, 'engineer'::app_role));

-- notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

CREATE POLICY "notifications_user_select_v3" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND org_id = public.get_user_org_id());
CREATE POLICY "notifications_user_update_v3" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND org_id = public.get_user_org_id())
  WITH CHECK (user_id = auth.uid() AND org_id = public.get_user_org_id());
