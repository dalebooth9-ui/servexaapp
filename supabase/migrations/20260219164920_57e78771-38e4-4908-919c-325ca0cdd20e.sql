-- Add branding JSONB column to job_sheet_templates
-- Stores: { company_name, company_subtitle, logo_url, footer_text }
ALTER TABLE public.job_sheet_templates
ADD COLUMN branding jsonb DEFAULT '{}'::jsonb;