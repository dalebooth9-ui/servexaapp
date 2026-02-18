
-- PPM schedules table
CREATE TABLE public.ppm_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  frequency_interval integer NOT NULL DEFAULT 1,
  frequency_unit text NOT NULL DEFAULT 'months',
  priority text NOT NULL DEFAULT 'medium',
  category text NOT NULL DEFAULT 'general',
  next_due_date date NOT NULL,
  last_generated_at timestamp with time zone,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Validate frequency_unit
CREATE OR REPLACE FUNCTION public.validate_ppm_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.frequency_unit NOT IN ('days', 'weeks', 'months') THEN
    RAISE EXCEPTION 'Invalid frequency unit: %. Must be days, weeks, or months.', NEW.frequency_unit;
  END IF;
  IF NEW.status NOT IN ('active', 'paused') THEN
    RAISE EXCEPTION 'Invalid PPM status: %. Must be active or paused.', NEW.status;
  END IF;
  IF NEW.frequency_interval < 1 THEN
    RAISE EXCEPTION 'Frequency interval must be at least 1.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_ppm_schedule
  BEFORE INSERT OR UPDATE ON public.ppm_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_ppm_schedule();

CREATE TRIGGER update_ppm_schedules_updated_at
  BEFORE UPDATE ON public.ppm_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.ppm_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all PPM schedules"
  ON public.ppm_schedules FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view PPM schedules"
  ON public.ppm_schedules FOR SELECT
  USING (has_role(auth.uid(), 'engineer'::app_role));

-- Indexes
CREATE INDEX idx_ppm_schedules_asset_id ON public.ppm_schedules(asset_id);
CREATE INDEX idx_ppm_schedules_next_due ON public.ppm_schedules(next_due_date);
CREATE INDEX idx_ppm_schedules_status ON public.ppm_schedules(status);

-- Sequence for PPM job reference numbers
CREATE SEQUENCE IF NOT EXISTS ppm_job_seq START 1;
