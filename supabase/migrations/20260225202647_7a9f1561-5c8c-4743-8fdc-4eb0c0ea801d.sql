
-- Create job_templates table for saving common job configurations
CREATE TABLE public.job_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  priority text NOT NULL DEFAULT 'medium',
  pressure_test_qty integer NOT NULL DEFAULT 0,
  visual_qty integer NOT NULL DEFAULT 0,
  address text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.job_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage job templates"
  ON public.job_templates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view job templates"
  ON public.job_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_job_templates_updated_at
  BEFORE UPDATE ON public.job_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
