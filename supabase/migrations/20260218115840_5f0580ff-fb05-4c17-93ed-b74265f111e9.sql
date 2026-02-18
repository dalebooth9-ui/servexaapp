-- Activity log to track the lifecycle of each job
CREATE TABLE public.job_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id UUID,
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_activity_log_job_id ON public.job_activity_log(job_id);
CREATE INDEX idx_job_activity_log_created_at ON public.job_activity_log(created_at DESC);

ALTER TABLE public.job_activity_log ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins can manage all activity logs"
  ON public.job_activity_log FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Engineers can view logs for assigned jobs
CREATE POLICY "Engineers can view activity logs for assigned jobs"
  ON public.job_activity_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM job_assignments ja
    WHERE ja.job_id = job_activity_log.job_id AND ja.engineer_id = auth.uid()
  ));

-- Engineers can insert logs for assigned jobs
CREATE POLICY "Engineers can insert activity logs for assigned jobs"
  ON public.job_activity_log FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM job_assignments ja
      WHERE ja.job_id = job_activity_log.job_id AND ja.engineer_id = auth.uid()
    )
  );

-- Auto-log job status changes
CREATE OR REPLACE FUNCTION public.log_job_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.job_activity_log (job_id, action, details)
    VALUES (NEW.id, 'status_change', 'Status changed from ' || OLD.status || ' to ' || NEW.status);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_job_status_change
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.log_job_status_change();

-- Auto-log visit status changes
CREATE OR REPLACE FUNCTION public.log_visit_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.job_activity_log (job_id, action, details)
    VALUES (NEW.job_id, 'visit_update', 'Visit on ' || NEW.scheduled_date || ' changed to ' || NEW.status);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_visit_status_change
  AFTER UPDATE ON public.job_visits
  FOR EACH ROW
  EXECUTE FUNCTION public.log_visit_status_change();

-- Auto-log new submissions
CREATE OR REPLACE FUNCTION public.log_new_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.job_activity_log (job_id, user_id, action, details)
  VALUES (NEW.job_id, NEW.engineer_id, 'submission', NEW.type || COALESCE(': ' || NEW.file_name, ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_new_submission
  AFTER INSERT ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.log_new_submission();

-- Enable realtime for activity log
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_activity_log;