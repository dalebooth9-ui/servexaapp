-- Convert all Yes/No select fields across all job sheet templates to "checkbox" type
-- so they render with the consistent YES/NO tick-box UI used by the Dry Riser Visual template.
UPDATE public.job_sheet_templates
SET fields = (
  SELECT jsonb_agg(
    CASE
      WHEN (f->>'type') = 'select'
        AND f ? 'options'
        AND jsonb_typeof(f->'options') = 'array'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(f->'options') o WHERE lower(o) = 'yes'
        )
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(f->'options') o WHERE lower(o) = 'no'
        )
      THEN (f - 'options') || jsonb_build_object('type', 'checkbox')
      ELSE f
    END
  )
  FROM jsonb_array_elements(fields::jsonb) f
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(fields::jsonb) f
  WHERE (f->>'type') = 'select'
    AND f ? 'options'
    AND jsonb_typeof(f->'options') = 'array'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(f->'options') o WHERE lower(o) = 'yes')
    AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(f->'options') o WHERE lower(o) = 'no')
);