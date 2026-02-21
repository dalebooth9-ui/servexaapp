-- Add category column to job_sheet_templates to link templates to job categories
ALTER TABLE public.job_sheet_templates ADD COLUMN category text DEFAULT NULL;

-- Create an index for quick lookup
CREATE INDEX idx_job_sheet_templates_category ON public.job_sheet_templates(category);
