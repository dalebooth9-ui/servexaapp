
-- Fault codes table for standardised priority assessment
CREATE TABLE public.fault_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.fault_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view fault codes"
  ON public.fault_codes FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage fault codes"
  ON public.fault_codes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add fault_code_id and recurrence fields to jobs
ALTER TABLE public.jobs
  ADD COLUMN fault_code_id UUID REFERENCES public.fault_codes(id),
  ADD COLUMN job_type TEXT NOT NULL DEFAULT 'one_off',
  ADD COLUMN recurrence_interval INTEGER,
  ADD COLUMN recurrence_unit TEXT,
  ADD COLUMN recurrence_start_date DATE,
  ADD COLUMN recurrence_end_date DATE;

-- Job visits table for multi-visit tracking
CREATE TABLE public.job_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  engineer_id UUID,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  status TEXT NOT NULL DEFAULT 'upcoming',
  notes TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.job_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all visits"
  ON public.job_visits FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view assigned job visits"
  ON public.job_visits FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM job_assignments ja
    WHERE ja.job_id = job_visits.job_id AND ja.engineer_id = auth.uid()
  ));

CREATE POLICY "Engineers can update assigned visits"
  ON public.job_visits FOR UPDATE
  USING (engineer_id = auth.uid())
  WITH CHECK (engineer_id = auth.uid());

-- Trigger for updated_at on job_visits
CREATE TRIGGER update_job_visits_updated_at
  BEFORE UPDATE ON public.job_visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation trigger for visit status
CREATE OR REPLACE FUNCTION public.validate_visit_status()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('unscheduled', 'upcoming', 'overdue', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid visit status: %. Must be unscheduled, upcoming, overdue, completed, or cancelled.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_job_visit_status
  BEFORE INSERT OR UPDATE ON public.job_visits
  FOR EACH ROW EXECUTE FUNCTION public.validate_visit_status();

-- Validation for job_type
CREATE OR REPLACE FUNCTION public.validate_job_type()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.job_type NOT IN ('one_off', 'recurring') THEN
    RAISE EXCEPTION 'Invalid job type: %. Must be one_off or recurring.', NEW.job_type;
  END IF;
  IF NEW.recurrence_unit IS NOT NULL AND NEW.recurrence_unit NOT IN ('days', 'weeks', 'months') THEN
    RAISE EXCEPTION 'Invalid recurrence unit: %. Must be days, weeks, or months.', NEW.recurrence_unit;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_job_type_trigger
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.validate_job_type();

-- Seed some common fault codes
INSERT INTO public.fault_codes (code, description, priority) VALUES
  ('FC001', 'Electrical fault - minor', 'low'),
  ('FC002', 'Electrical fault - major', 'high'),
  ('FC003', 'Plumbing leak - minor', 'low'),
  ('FC004', 'Plumbing leak - major', 'high'),
  ('FC005', 'HVAC malfunction', 'medium'),
  ('FC006', 'Structural damage', 'high'),
  ('FC007', 'Fire safety issue', 'high'),
  ('FC008', 'General maintenance', 'low'),
  ('FC009', 'Equipment breakdown', 'medium'),
  ('FC010', 'Emergency callout', 'high');
