DROP POLICY ops_requests_service_only ON public.ops_notification_requests;
CREATE POLICY ops_requests_company_admin ON public.ops_notification_requests FOR SELECT TO authenticated USING(org_id=public.get_user_org_id() AND public.has_role(auth.uid(),'admin'));
COMMENT ON COLUMN public.email_step_health.notification_token IS 'DEPRECATED: replaced by per-job ops_notification_requests.token';