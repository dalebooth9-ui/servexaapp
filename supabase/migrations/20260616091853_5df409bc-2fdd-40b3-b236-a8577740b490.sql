-- Replace single-photo "dwelling_photo" column with multi-photo "photos" gallery
-- in the Residential & Domestic Sprinkler annual service template.
UPDATE public.job_sheet_templates
SET fields = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'id' = 'dwelling_access_log' THEN
        jsonb_set(
          elem,
          '{columns}',
          (
            SELECT jsonb_agg(
              CASE
                WHEN col->>'id' = 'dwelling_photo'
                  THEN jsonb_build_object(
                    'id', 'photos',
                    'type', 'photo_gallery',
                    'label', 'Photos'
                  )
                ELSE col
              END
            )
            FROM jsonb_array_elements(elem->'columns') col
          )
        )
      ELSE elem
    END
  )
  FROM jsonb_array_elements(fields) elem
)
WHERE id = '3b95ee75-8103-4cbb-9487-614657ea1f3e'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(fields) e
    WHERE e->>'id' = 'dwelling_access_log'
  );

-- Ensure the column exists even if the previous photo column was already removed
UPDATE public.job_sheet_templates
SET fields = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'id' = 'dwelling_access_log'
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(elem->'columns') c
          WHERE c->>'id' = 'photos'
        )
      THEN
        jsonb_set(
          elem,
          '{columns}',
          (elem->'columns') || jsonb_build_array(
            jsonb_build_object('id','photos','type','photo_gallery','label','Photos')
          )
        )
      ELSE elem
    END
  )
  FROM jsonb_array_elements(fields) elem
)
WHERE id = '3b95ee75-8103-4cbb-9487-614657ea1f3e';

-- Backfill: convert any previously-saved single dwelling_photo values inside
-- responses.dwelling_access_log[].dwelling_photo into the new photos array.
UPDATE public.job_sheet_responses r
SET responses = jsonb_set(
  r.responses,
  '{dwelling_access_log}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN row_elem ? 'dwelling_photo'
          AND row_elem->>'dwelling_photo' IS NOT NULL
          AND row_elem->>'dwelling_photo' <> ''
        THEN
          (row_elem - 'dwelling_photo')
          || jsonb_build_object(
            'photos',
            COALESCE(row_elem->'photos', '[]'::jsonb)
            || jsonb_build_array(
              jsonb_build_object(
                'path', row_elem->>'dwelling_photo',
                'caption', '',
                'uploaded_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
              )
            )
          )
        ELSE row_elem
      END
    )
    FROM jsonb_array_elements(r.responses->'dwelling_access_log') row_elem
  )
)
WHERE jsonb_typeof(r.responses->'dwelling_access_log') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(r.responses->'dwelling_access_log') row_elem
    WHERE row_elem ? 'dwelling_photo'
      AND row_elem->>'dwelling_photo' IS NOT NULL
      AND row_elem->>'dwelling_photo' <> ''
  );