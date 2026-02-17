-- Create a table for weekly job schedule entries
CREATE TABLE public.job_schedule (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  engineer_id UUID NOT NULL,
  schedule_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(job_id, engineer_id, schedule_date)
);

-- Enable RLS
ALTER TABLE public.job_schedule ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage all schedules"
ON public.job_schedule
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Engineers can view their own schedule
CREATE POLICY "Engineers can view own schedule"
ON public.job_schedule
FOR SELECT
USING (engineer_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_job_schedule_updated_at
BEFORE UPDATE ON public.job_schedule
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_schedule;