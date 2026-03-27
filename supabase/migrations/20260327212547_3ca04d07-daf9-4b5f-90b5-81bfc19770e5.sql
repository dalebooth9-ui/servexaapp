
-- Fix: Update existing RAMS template slug to match actual job category
UPDATE category_document_templates 
SET category_slug = 'dry_riser_pressure_test' 
WHERE category_slug = 'pressure_test';

-- Add Dry Riser Pressure Test Sheet as auto-attach document (using blank_job_sheet type)
INSERT INTO category_document_templates (category_slug, document_type, label, sort_order, enabled)
VALUES ('dry_riser_pressure_test', 'blank_job_sheet', 'Dry Riser Pressure test', 1, true);
