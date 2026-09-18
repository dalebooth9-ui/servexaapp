CREATE TABLE IF NOT EXISTS public.media_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  survey_id uuid,
  file_path text NOT NULL,
  bucket text,
  transcript text,
  summary text,
  suggested_remedials jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  error text,
  duration_seconds numeric,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_transcripts TO authenticated;
GRANT ALL ON public.media_transcripts TO service_role;

ALTER TABLE public.media_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org transcripts"
  ON public.media_transcripts FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

CREATE POLICY "Users can insert transcripts"
  ON public.media_transcripts FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND org_id = public.get_user_org_id());

CREATE POLICY "Users can update own transcripts"
  ON public.media_transcripts FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "Admins can delete org transcripts"
  ON public.media_transcripts FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_media_transcripts_job ON public.media_transcripts(job_id);
CREATE INDEX IF NOT EXISTS idx_media_transcripts_file ON public.media_transcripts(file_path);