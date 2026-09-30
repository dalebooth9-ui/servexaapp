ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS office_email text;

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check CHECK (status = ANY (ARRAY['active','scheduled','in_progress','awaiting_parts','on_hold','requires_revisit','completed','archived','pending_review','rejected','submitted_for_review']));

ALTER TABLE public.job_sheet_responses
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by uuid,
  ADD COLUMN IF NOT EXISTS returned_reason text,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz;

CREATE TABLE public.report_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  details text,
  pdf_path text,
  client_request_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_review_events_job_idx ON public.report_review_events(job_id, created_at);
GRANT SELECT, INSERT ON public.report_review_events TO authenticated;
GRANT ALL ON public.report_review_events TO service_role;
ALTER TABLE public.report_review_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admins read review events" ON public.report_review_events
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id() AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Assigned engineers read own job review events" ON public.report_review_events
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id() AND EXISTS (SELECT 1 FROM public.job_assignments a WHERE a.job_id = report_review_events.job_id AND a.engineer_id = auth.uid()));

-- Lock: engineers cannot edit a locked report; admins can.
CREATE OR REPLACE FUNCTION public.guard_locked_job_sheet_response()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(),'admin')
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'This report has been submitted to the office and is locked';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_locked_job_sheet_response BEFORE UPDATE ON public.job_sheet_responses
  FOR EACH ROW EXECUTE FUNCTION public.guard_locked_job_sheet_response();