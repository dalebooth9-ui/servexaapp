CREATE TABLE public.photo_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.photo_tags TO authenticated;
GRANT ALL ON public.photo_tags TO service_role;

ALTER TABLE public.photo_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage photo tags" ON public.photo_tags
  FOR ALL
  TO authenticated
  USING (org_id = public.get_user_org_id())
  WITH CHECK (org_id = public.get_user_org_id());

CREATE TABLE public.submission_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.photo_tags(id) ON DELETE CASCADE,
  tagged_by UUID,
  tagged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(submission_id, tag_id)
);

CREATE INDEX idx_submission_tags_submission ON public.submission_tags(submission_id);
CREATE INDEX idx_submission_tags_tag ON public.submission_tags(tag_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_tags TO authenticated;
GRANT ALL ON public.submission_tags TO service_role;

ALTER TABLE public.submission_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage submission tags" ON public.submission_tags
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = submission_tags.submission_id
        AND s.org_id = public.get_user_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = submission_tags.submission_id
        AND s.org_id = public.get_user_org_id()
    )
  );

ALTER TABLE public.defects ADD COLUMN IF NOT EXISTS linked_photo_url TEXT;
ALTER TABLE public.defects ADD COLUMN IF NOT EXISTS linked_submission_id UUID REFERENCES public.submissions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_defects_linked_submission ON public.defects(linked_submission_id);

ALTER TABLE public.job_remedial_items ADD COLUMN IF NOT EXISTS linked_photo_url TEXT;

INSERT INTO public.photo_tags (org_id, name, color)
SELECT o.id, t.name, t.color
FROM public.organisations o
CROSS JOIN (VALUES
  ('Defect', '#ef4444'),
  ('Completed', '#22c55e'),
  ('Before', '#3b82f6'),
  ('After', '#8b5cf6'),
  ('Remedial Required', '#f97316'),
  ('Compliant', '#10b981'),
  ('Non-Compliant', '#dc2626'),
  ('Follow Up', '#eab308')
) AS t(name, color)
ON CONFLICT (org_id, name) DO NOTHING;