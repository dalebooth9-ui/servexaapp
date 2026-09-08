CREATE TABLE public.rams_autoattach_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  category_slug text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('rams','generic_rams','rams_documents')),
  source_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, category_slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rams_autoattach_map TO authenticated;
GRANT ALL ON public.rams_autoattach_map TO service_role;

ALTER TABLE public.rams_autoattach_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view rams auto-attach map"
ON public.rams_autoattach_map FOR SELECT TO authenticated
USING (org_id = public.get_user_org_id());

CREATE POLICY "Admins manage rams auto-attach map"
ON public.rams_autoattach_map FOR ALL TO authenticated
USING (org_id = public.get_user_org_id() AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (org_id = public.get_user_org_id() AND public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_rams_autoattach_map_updated_at
BEFORE UPDATE ON public.rams_autoattach_map
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed obvious matches: newest RAMS document per org + job type.
WITH src AS (
  SELECT d.org_id, j.category AS category_slug, 'rams_documents'::text AS source_kind, d.id AS source_id, d.created_at
  FROM public.rams_documents d JOIN public.jobs j ON j.id = d.job_id
  WHERE d.org_id IS NOT NULL AND j.category IS NOT NULL
  UNION ALL
  SELECT r.org_id, j.category, 'rams', r.id, r.created_at
  FROM public.rams r JOIN public.jobs j ON j.id = r.job_id
  WHERE r.org_id IS NOT NULL AND j.category IS NOT NULL
  UNION ALL
  SELECT g.org_id, j.category, 'generic_rams', g.id, g.created_at
  FROM public.generic_rams g JOIN public.jobs j ON j.id = g.job_id
  WHERE g.org_id IS NOT NULL AND j.category IS NOT NULL
), ranked AS (
  SELECT *, row_number() OVER (PARTITION BY org_id, category_slug ORDER BY created_at DESC) rn FROM src
)
INSERT INTO public.rams_autoattach_map (org_id, category_slug, source_kind, source_id)
SELECT org_id, category_slug, source_kind, source_id FROM ranked WHERE rn = 1
ON CONFLICT (org_id, category_slug) DO NOTHING;