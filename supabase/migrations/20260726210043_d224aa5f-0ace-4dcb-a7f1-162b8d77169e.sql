-- 1. Mapping table
CREATE TABLE IF NOT EXISTS public.job_category_template_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_category_slug TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES public.job_sheet_templates(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT true,
  org_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uniqueness: allow one row per (slug, template, org). NULL org = platform default.
CREATE UNIQUE INDEX IF NOT EXISTS job_category_template_map_uniq
  ON public.job_category_template_map (job_category_slug, template_id, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS job_category_template_map_slug_idx
  ON public.job_category_template_map (job_category_slug);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_category_template_map TO authenticated;
GRANT ALL ON public.job_category_template_map TO service_role;

ALTER TABLE public.job_category_template_map ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can read their org's mappings + platform defaults
CREATE POLICY "Read own-org + platform mappings"
  ON public.job_category_template_map
  FOR SELECT
  TO authenticated
  USING (
    org_id IS NULL
    OR org_id IN (SELECT om.org_id FROM public.organisation_members om WHERE om.user_id = auth.uid())
  );

-- Admins/managers in the org can write their org's mappings (not platform defaults)
CREATE POLICY "Admins manage own-org mappings"
  ON public.job_category_template_map
  FOR ALL
  TO authenticated
  USING (
    org_id IS NOT NULL
      AND EXISTS (
      SELECT 1 FROM public.organisation_members m
      WHERE m.user_id = auth.uid()
        AND m.org_id = job_category_template_map.org_id
        AND m.role IN ('admin','manager','owner')
    )
  )
  WITH CHECK (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organisation_members m
      WHERE m.user_id = auth.uid()
        AND m.org_id = job_category_template_map.org_id
        AND m.role IN ('admin','manager','owner')
    )
  );

CREATE TRIGGER trg_job_category_template_map_updated
  BEFORE UPDATE ON public.job_category_template_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Seed PLATFORM-DEFAULT mappings from existing template.job_category values
INSERT INTO public.job_category_template_map (job_category_slug, template_id, sort_order, is_default, org_id)
SELECT t.job_category, t.id,
  CASE WHEN t.locked THEN 0 ELSE 10 END,
  true, NULL
FROM public.job_sheet_templates t
WHERE t.status = 'published' AND t.job_category IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Alias missing job types to closest existing templates (platform-wide)
--    dry_riser_service → Pressure Test + Visual Inspection
INSERT INTO public.job_category_template_map (job_category_slug, template_id, sort_order, is_default, org_id)
SELECT 'dry_riser_service', id, 0, true, NULL FROM public.job_sheet_templates
  WHERE name IN ('Dry Riser — Pressure Test','Dry Riser — Visual Inspection') AND status='published'
ON CONFLICT DO NOTHING;

--    Sprinkler alias family → Sprinkler Annual Service (canonical)
INSERT INTO public.job_category_template_map (job_category_slug, template_id, sort_order, is_default, org_id)
SELECT unnest(ARRAY[
  'sprinkler_remedial','sprinkler_installation',
  'commercial_sprinkler_service','commercial_sprinkler_installation','commercial_sprinkler_remedial'
]), id, 0, true, NULL
FROM public.job_sheet_templates
WHERE name = 'Sprinkler — Annual Service' AND status='published'
ON CONFLICT DO NOTHING;

--    wet_riser_visual → Wet Riser Annual sheet
INSERT INTO public.job_category_template_map (job_category_slug, template_id, sort_order, is_default, org_id)
SELECT 'wet_riser_visual', id, 0, true, NULL FROM public.job_sheet_templates
  WHERE name = 'Wet Riser — Annual Service & Test' AND status='published'
ON CONFLICT DO NOTHING;

-- 4. Collapse duplicate job_categories rows (keep earliest per slug)
DELETE FROM public.job_categories a
USING public.job_categories b
WHERE a.slug = b.slug
  AND a.created_at > b.created_at;

-- 5. Read-only audit view
CREATE OR REPLACE VIEW public.v_job_type_template_map AS
SELECT
  m.job_category_slug,
  jc.name AS job_type_name,
  t.id AS template_id,
  t.name AS template_name,
  t.locked,
  m.sort_order,
  m.org_id
FROM public.job_category_template_map m
JOIN public.job_sheet_templates t ON t.id = m.template_id
LEFT JOIN public.job_categories jc ON jc.slug = m.job_category_slug
ORDER BY m.job_category_slug, m.sort_order, t.name;

GRANT SELECT ON public.v_job_type_template_map TO authenticated, service_role;