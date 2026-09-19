CREATE TABLE IF NOT EXISTS public.shared_galleries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  title TEXT,
  description TEXT,
  selected_submission_ids UUID[] NOT NULL DEFAULT '{}',
  include_annotations BOOLEAN NOT NULL DEFAULT true,
  include_checklist_photos BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  view_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS shared_galleries_job_idx ON public.shared_galleries (job_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_galleries TO authenticated;
GRANT ALL ON public.shared_galleries TO service_role;

ALTER TABLE public.shared_galleries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage shared galleries"
  ON public.shared_galleries
  FOR ALL
  TO authenticated
  USING (org_id = public.get_user_org_id())
  WITH CHECK (org_id = public.get_user_org_id());