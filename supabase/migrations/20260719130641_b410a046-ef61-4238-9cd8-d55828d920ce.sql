
-- Swap array positions 12 and 13 (0-based) for each affected Dry Riser template:
-- before: [12]=number_of_outlets, [13]=landing_valve_good_condition
-- after:  [12]=landing_valve_good_condition, [13]=number_of_outlets
UPDATE public.job_sheet_templates
SET fields = jsonb_set(
  jsonb_set(fields, '{12}', fields->13, false),
  '{13}', fields->12, false
),
updated_at = now()
WHERE id IN (
  '6ed53f1b-dab4-49d5-bc16-6aee3d8bcc1a', -- Viva Dry Riser — Pressure Test
  '7f14a139-f4fc-4bcc-8abe-e357bb2a11ba', -- Viva Dry Riser — Visual Inspection
  'bbdf3fd1-b155-481f-a175-b3eb77ed0487', -- Viva retired duplicate (kept in sync so future re-clone is safe)
  '6f5fb0aa-d186-4919-acc2-cdbb46c25221', -- Probe Co Dry Riser — Pressure Test
  '30bef1c4-1c28-42be-8f04-f99f6af4bd8e'  -- Probe Co Dry Riser — Visual Inspection
)
AND fields->12->>'id' = 'number_of_outlets'
AND fields->13->>'id' = 'landing_valve_good_condition';
