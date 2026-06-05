
UPDATE public.job_sheet_templates
SET fields = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'id' = 'dwelling_access_log' THEN
        jsonb_set(
          elem,
          '{columns}',
          (elem->'columns') || jsonb_build_array(
            jsonb_build_object('id','dwelling_photo','type','photo','label','Dwelling Photo')
          )
        )
      ELSE elem
    END
  )
  FROM jsonb_array_elements(fields) elem
)
WHERE id = '3b95ee75-8103-4cbb-9487-614657ea1f3e';

UPDATE public.job_sheet_templates
SET fields = fields || jsonb_build_array(
  jsonb_build_object(
    'id','room_heads_breakdown',
    'type','repeating_table',
    'label','Room Heads Breakdown (per room)',
    'section','Dwelling Access Log',
    'required', false,
    'columns', jsonb_build_array(
      jsonb_build_object('id','unit_number','type','text','label','Unit / Flat No.'),
      jsonb_build_object('id','room','type','text','label','Room / Location'),
      jsonb_build_object('id','head_count','type','number','label','Head Count'),
      jsonb_build_object('id','notes','type','text','label','Notes')
    )
  )
)
WHERE id = '3b95ee75-8103-4cbb-9487-614657ea1f3e';
