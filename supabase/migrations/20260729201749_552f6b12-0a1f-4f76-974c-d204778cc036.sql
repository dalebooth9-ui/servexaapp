
UPDATE public.job_sheet_templates
SET name = 'Remedial Works Report',
    description = 'Generic remedial / repair works report — works carried out, materials, before & after photos and sign-off. Suitable for any trade.',
    category = 'remedial',
    job_category = 'remedial',
    status = 'published',
    fields = '[
      {"id":"site_name","type":"text","label":"Site Name","section":"Site Details","required":true},
      {"id":"site_address","type":"textarea","label":"Site Address","section":"Site Details","required":true},
      {"id":"customer","type":"text","label":"Customer","section":"Site Details","required":false},
      {"id":"reference","type":"text","label":"Reference / Job Number","section":"Site Details","required":false},
      {"id":"po_number","type":"text","label":"Purchase Order Number","section":"Site Details","required":false},
      {"id":"date","type":"date","label":"Date of Works","section":"Site Details","required":true},
      {"id":"engineer","type":"text","label":"Engineer Name","section":"Site Details","required":true},
      {"id":"works_table","type":"repeating_table","label":"Remedial works carried out","section":"Works Carried Out","required":false,
       "columns":[
         {"id":"description","label":"Description of works","type":"text"},
         {"id":"completed","label":"Completed","type":"yn_na"},
         {"id":"photo_before","label":"Before","type":"photo"},
         {"id":"photo_after","label":"After","type":"photo"},
         {"id":"comments","label":"Comments","type":"text"}
       ]},
      {"id":"system_left_operational","type":"checkbox","label":"System left fully operational","section":"Works Carried Out","required":false,"allow_notes":true},
      {"id":"further_works_required","type":"checkbox","label":"Further works required","section":"Works Carried Out","required":false,"allow_notes":true},
      {"id":"materials_used","type":"textarea","label":"Materials used","section":"Materials","required":false},
      {"id":"overall_comments","type":"textarea","label":"Overall comments","section":"Summary","required":false}
    ]'::jsonb
WHERE id = '4871a371-2139-4c6a-a23f-5de7e81570a7';

DELETE FROM public.job_category_template_map
WHERE job_category_slug IN ('sprinkler_remedial','commercial_sprinkler_remedial')
  AND template_id = '3b95ee75-8103-4cbb-9487-614657ea1f3e';

INSERT INTO public.job_category_template_map (job_category_slug, template_id, sort_order, org_id)
SELECT s, '4871a371-2139-4c6a-a23f-5de7e81570a7', 0, NULL
FROM unnest(ARRAY['sprinkler_remedial','commercial_sprinkler_remedial','remedial','remedials','repairs']) AS s
WHERE NOT EXISTS (
  SELECT 1 FROM public.job_category_template_map m
  WHERE m.job_category_slug = s AND m.template_id = '4871a371-2139-4c6a-a23f-5de7e81570a7' AND m.org_id IS NULL
);

ALTER TABLE public.job_photo_checklist_responses
  ALTER COLUMN checklist_id DROP NOT NULL,
  ALTER COLUMN item_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS remedial_item_id uuid REFERENCES public.job_remedial_items(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS job_photo_checklist_remedial_item_unique
  ON public.job_photo_checklist_responses (remedial_item_id)
  WHERE remedial_item_id IS NOT NULL;

DELETE FROM public.job_sheet_responses WHERE id = 'eca0416d-4927-4a20-a704-df8f2a0ba64f';

INSERT INTO public.job_sheet_responses (job_id, template_id, status, responses, org_id, submitted_by)
SELECT '87243a22-f3e7-4a95-bfbd-7f356ca48133', '4871a371-2139-4c6a-a23f-5de7e81570a7', 'draft', '{}'::jsonb,
       '11111111-1111-1111-1111-111111111111', 'bdf890d7-4d88-4993-aebc-a3e9c39cf7ce'
WHERE NOT EXISTS (
  SELECT 1 FROM public.job_sheet_responses r
  WHERE r.job_id = '87243a22-f3e7-4a95-bfbd-7f356ca48133'
    AND r.template_id = '4871a371-2139-4c6a-a23f-5de7e81570a7'
);
