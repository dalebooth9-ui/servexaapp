
INSERT INTO public.help_articles
  (slug, route_pattern, title, purpose, steps, common_problems, related_slugs, keywords,
   source_paths, category, audience, guide_order, is_guide, last_updated)
VALUES (
  'defects.pipeline',
  '/jobs/:id',
  'Turning defects into quoted work',
  'Every defect on a job can become quoted work in a couple of taps, and the remedial pipeline strip shows how many are still waiting, quoted, approved or finished.',
  '[{"heading":"On the job page","items":["The Defects section shows a remedial pipeline: total defects, how many are quoted (with the quote value), how many are approved and how many are resolved.","Quote all unquoted creates one draft quote containing every open defect that has no quote yet - each defect becomes a line.","Add to quote on a single defect lets you drop it onto an existing draft or sent quote, or start a fresh draft."]},{"heading":"What happens next","items":["Prices always start at zero - add them from the price book or by hand before sending.","When the quote is marked approved, the defects on it move to approved automatically.","Creating the remedial job from that quote links the job back to each defect and marks them as job created."]},{"heading":"Carried-forward remedials","items":["Remedials copied from a previous visit are highlighted on the dashboard as remedials from previous jobs that need quoting.","Tap that message to see them filtered and quote them in one go."]}]'::jsonb,
  '[{"problem":"Quote all unquoted is missing","fix":"It only appears for admins, and only when there is at least one open defect without a quote."},{"problem":"All defects must belong to the same site","fix":"A quote covers one site. Quote each site separately."},{"problem":"The quote shows no value","fix":"Lines are created without prices on purpose. Open the quote and price them before sending."}]'::jsonb,
  ARRAY['defects','defects.ai-draft-quote','quotes','jobs.carry-forward-remedials'],
  ARRAY['defect quote batch remedial pipeline approved job created'],
  ARRAY['/jobs/:id','src/components/jobs/JobDefects.tsx','src/lib/defectQuoting.ts'],
  'Defects & money',
  ARRAY['admin'],
  35,
  true,
  now()
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  purpose = EXCLUDED.purpose,
  steps = EXCLUDED.steps,
  common_problems = EXCLUDED.common_problems,
  related_slugs = EXCLUDED.related_slugs,
  keywords = EXCLUDED.keywords,
  source_paths = EXCLUDED.source_paths,
  category = EXCLUDED.category,
  audience = EXCLUDED.audience,
  guide_order = EXCLUDED.guide_order,
  is_guide = true,
  last_updated = now();

UPDATE public.help_articles
   SET related_slugs = (SELECT array_agg(DISTINCT s) FROM unnest(related_slugs || ARRAY['defects.pipeline']) s),
       last_updated = now()
 WHERE slug IN ('defects','quotes','jobs.carry-forward-remedials','defects.ai-draft-quote','jobs.detail');
