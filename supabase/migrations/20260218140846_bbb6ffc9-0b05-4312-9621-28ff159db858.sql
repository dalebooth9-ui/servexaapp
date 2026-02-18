
-- 1. Create parts/materials tracking table
CREATE TABLE public.job_parts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  notes TEXT,
  added_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.job_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all job parts"
ON public.job_parts FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can add parts to assigned jobs"
ON public.job_parts FOR INSERT
WITH CHECK (
  added_by = auth.uid() AND
  EXISTS (SELECT 1 FROM job_assignments ja WHERE ja.job_id = job_parts.job_id AND ja.engineer_id = auth.uid())
);

CREATE POLICY "Engineers can view parts for assigned jobs"
ON public.job_parts FOR SELECT
USING (
  EXISTS (SELECT 1 FROM job_assignments ja WHERE ja.job_id = job_parts.job_id AND ja.engineer_id = auth.uid())
);

CREATE POLICY "Engineers can update own parts"
ON public.job_parts FOR UPDATE
USING (added_by = auth.uid())
WITH CHECK (added_by = auth.uid());

CREATE POLICY "Engineers can delete own parts"
ON public.job_parts FOR DELETE
USING (added_by = auth.uid());

CREATE TRIGGER update_job_parts_updated_at
BEFORE UPDATE ON public.job_parts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Expand job status validation to include new statuses
CREATE OR REPLACE FUNCTION public.validate_job_priority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.priority NOT IN ('high', 'medium', 'low') THEN
    RAISE EXCEPTION 'Invalid priority: %. Must be high, medium, or low.', NEW.priority;
  END IF;
  -- Validate expanded statuses
  IF NEW.status NOT IN ('active', 'completed', 'archived', 'awaiting_parts', 'on_hold', 'requires_revisit', 'scheduled', 'in_progress') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be active, completed, archived, awaiting_parts, on_hold, requires_revisit, scheduled, or in_progress.', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$;
