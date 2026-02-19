
-- Template definitions (admin creates these, can be reused across jobs)
CREATE TABLE public.job_sheet_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Engineer completions of a template for a specific job
CREATE TABLE public.job_sheet_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.job_sheet_templates(id) ON DELETE CASCADE,
  responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Validation trigger for response status
CREATE OR REPLACE FUNCTION public.validate_sheet_response_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be draft or submitted.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_sheet_response_status_trigger
BEFORE INSERT OR UPDATE ON public.job_sheet_responses
FOR EACH ROW EXECUTE FUNCTION public.validate_sheet_response_status();

-- Updated_at triggers
CREATE TRIGGER update_job_sheet_templates_updated_at
BEFORE UPDATE ON public.job_sheet_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_sheet_responses_updated_at
BEFORE UPDATE ON public.job_sheet_responses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS for templates
ALTER TABLE public.job_sheet_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all templates"
ON public.job_sheet_templates FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view templates"
ON public.job_sheet_templates FOR SELECT
USING (has_role(auth.uid(), 'engineer'::app_role));

-- RLS for responses
ALTER TABLE public.job_sheet_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all responses"
ON public.job_sheet_responses FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can create responses for assigned jobs"
ON public.job_sheet_responses FOR INSERT
WITH CHECK (
  submitted_by = auth.uid() AND
  EXISTS (SELECT 1 FROM job_assignments ja WHERE ja.job_id = job_sheet_responses.job_id AND ja.engineer_id = auth.uid())
);

CREATE POLICY "Engineers can update own draft responses"
ON public.job_sheet_responses FOR UPDATE
USING (submitted_by = auth.uid() AND status = 'draft')
WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "Engineers can view responses for assigned jobs"
ON public.job_sheet_responses FOR SELECT
USING (
  EXISTS (SELECT 1 FROM job_assignments ja WHERE ja.job_id = job_sheet_responses.job_id AND ja.engineer_id = auth.uid())
);

-- Log template completion to activity
CREATE OR REPLACE FUNCTION public.log_sheet_response_submission()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'submitted' THEN
    INSERT INTO public.job_activity_log (job_id, user_id, action, details)
    VALUES (NEW.job_id, NEW.submitted_by, 'submission', 'Job sheet template completed');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER log_sheet_response_submission_trigger
AFTER UPDATE ON public.job_sheet_responses
FOR EACH ROW EXECUTE FUNCTION public.log_sheet_response_submission();
