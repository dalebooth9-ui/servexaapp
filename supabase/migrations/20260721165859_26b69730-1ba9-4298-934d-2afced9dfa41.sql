INSERT INTO public.help_articles (slug, route_pattern, title, purpose, steps, common_problems, related_slugs, keywords)
VALUES (
  'paper-scans',
  '/paper-scans',
  'Paper scans',
  'One place to digitise paper sheets: upload, review what the AI extracted, then file each sheet as a job or archive-only electronic copy.',
  '[
    {"step":"Upload","detail":"Drop photos of individual sheets or a multi-page scanner PDF on the Upload tab. Multi-page PDFs are split into individual forms automatically. You can also email sheets to your org scan intake address (Settings → Organisation)."},
    {"step":"Review","detail":"Every scanned sheet appears on the Review tab. The AI pre-fills customer, site, template, PO number, answers, defects and signatures. Amber flags mark low-confidence values — check those first."},
    {"step":"Choose outcome per sheet","detail":"File as job = creates a completed job (or attaches to an existing job with the same customer/site/date/PO), generates the electronic PDF, captures defects. Archive only = files the electronic copy against the customer/site as a historic record with defects, no job, no planner entry."},
    {"step":"History","detail":"Everything ever scanned lives on the History tab. Filter by customer, site, template, date and outcome. Admins can re-convert, re-render the PDF, or delete."}
  ]'::jsonb,
  '[
    {"problem":"Sheet went to the wrong outcome","fix":"Open it from History and delete, then re-file from the Review tab."},
    {"problem":"AI matched the wrong customer","fix":"Change the customer in the review dialog before filing — the linked customer is the source of truth on the rendered PDF."},
    {"problem":"Cant find a scan","fix":"Check the Review tab (still pending) or search History by customer/site."}
  ]'::jsonb,
  ARRAY['jobs','customers.detail','defects','sites']::text[],
  ARRAY['scan','paper','ocr','handwriting','archive','digitise','digitize','backlog','review queue','paper scans']::text[]
)
ON CONFLICT (slug) DO UPDATE SET
  route_pattern = EXCLUDED.route_pattern,
  title = EXCLUDED.title,
  purpose = EXCLUDED.purpose,
  steps = EXCLUDED.steps,
  common_problems = EXCLUDED.common_problems,
  related_slugs = EXCLUDED.related_slugs,
  keywords = EXCLUDED.keywords,
  last_updated = now();

UPDATE public.help_articles
SET route_pattern = '/paper-scans',
    related_slugs = ARRAY(SELECT DISTINCT unnest(related_slugs || ARRAY['paper-scans'])),
    last_updated = now()
WHERE slug IN ('paper-scan-queue','archive','jobs.paper-scan');