
-- Set correct job_category on Dry Riser Pressure test template
UPDATE job_sheet_templates 
SET job_category = 'dry_riser_pressure_test' 
WHERE id = '6ed53f1b-dab4-49d5-bc16-6aee3d8bcc1a';

-- Set correct job_category on Dry Riser Visual template
UPDATE job_sheet_templates 
SET job_category = 'dry_riser_visual' 
WHERE id = '7f14a139-f4fc-4bcc-8abe-e357bb2a11ba';
