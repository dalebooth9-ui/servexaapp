
-- Insert a new `valve_type` text field at index 14, immediately after
-- `number_of_outlets` (at index 13). Skips any template that already has
-- a valve_type field or where the layout has drifted, so this migration
-- is safe to re-run.
WITH targets AS (
  SELECT id, fields
  FROM public.job_sheet_templates
  WHERE id IN (
    '6ed53f1b-dab4-49d5-bc16-6aee3d8bcc1a',
    '7f14a139-f4fc-4bcc-8abe-e357bb2a11ba',
    'bbdf3fd1-b155-481f-a175-b3eb77ed0487',
    '6f5fb0aa-d186-4919-acc2-cdbb46c25221',
    '30bef1c4-1c28-42be-8f04-f99f6af4bd8e'
  )
    AND fields->13->>'id' = 'number_of_outlets'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(fields) f WHERE f->>'id' = 'valve_type'
    )
)
UPDATE public.job_sheet_templates t
SET fields = (
  SELECT jsonb_agg(elem ORDER BY idx)
  FROM (
    SELECT elem, idx FROM jsonb_array_elements(t.fields) WITH ORDINALITY AS a(elem, idx) WHERE idx <= 14
    UNION ALL
    SELECT jsonb_build_object(
      'id', 'valve_type',
      'type', 'text',
      'label', 'Valve type:',
      'section', 'Internal Equipment',
      'required', false,
      'allow_notes', true,
      'placeholder', 'e.g. instantaneous / screw thread'
    ) AS elem, 14.5 AS idx
    UNION ALL
    SELECT elem, idx FROM jsonb_array_elements(t.fields) WITH ORDINALITY AS b(elem, idx) WHERE idx > 14
  ) merged
),
updated_at = now()
FROM targets
WHERE targets.id = t.id;
