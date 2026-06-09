CREATE TABLE IF NOT EXISTS public.job_site_survey_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id uuid NOT NULL REFERENCES public.job_site_surveys(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  caption text,
  what3words text,
  kind text NOT NULL DEFAULT 'photo',
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_site_survey_photos TO authenticated;
GRANT ALL ON public.job_site_survey_photos TO service_role;

ALTER TABLE public.job_site_survey_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all job survey photos" ON public.job_site_survey_photos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Engineers manage photos for assigned jobs" ON public.job_site_survey_photos
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.job_assignments ja
            WHERE ja.job_id = job_site_survey_photos.job_id AND ja.engineer_id = auth.uid())
    OR created_by = auth.uid()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.job_assignments ja
            WHERE ja.job_id = job_site_survey_photos.job_id AND ja.engineer_id = auth.uid())
    OR created_by = auth.uid()
  );

CREATE INDEX IF NOT EXISTS idx_job_site_survey_photos_survey ON public.job_site_survey_photos(survey_id);
CREATE INDEX IF NOT EXISTS idx_job_site_survey_photos_job ON public.job_site_survey_photos(job_id);