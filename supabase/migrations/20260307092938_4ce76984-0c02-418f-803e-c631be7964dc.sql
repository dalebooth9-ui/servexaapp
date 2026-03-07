
ALTER TABLE public.category_document_templates
  DROP CONSTRAINT IF EXISTS category_document_templates_document_type_check;

ALTER TABLE public.category_document_templates
  ADD CONSTRAINT category_document_templates_document_type_check
  CHECK (document_type = ANY (ARRAY[
    'rams_pdf'::text,
    'blank_job_sheet'::text,
    'uploaded_file'::text,
    'quote'::text,
    'purchase_order'::text,
    'site_drawing'::text
  ]));
