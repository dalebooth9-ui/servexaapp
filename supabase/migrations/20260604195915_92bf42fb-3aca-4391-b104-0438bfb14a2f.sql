
ALTER TABLE public.site_surveys ADD COLUMN IF NOT EXISTS converted_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.site_survey_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.site_surveys(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'photo',
  file_path text NOT NULL,
  caption text,
  what3words text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_survey_photos TO authenticated;
GRANT ALL ON public.site_survey_photos TO service_role;

ALTER TABLE public.site_survey_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all survey photos" ON public.site_survey_photos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users manage photos for own/assigned surveys" ON public.site_survey_photos
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.site_surveys s
    WHERE s.id = site_survey_photos.survey_id
      AND (s.engineer_id = auth.uid() OR s.created_by = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.site_surveys s
    WHERE s.id = site_survey_photos.survey_id
      AND (s.engineer_id = auth.uid() OR s.created_by = auth.uid())
  ));

CREATE INDEX IF NOT EXISTS idx_site_survey_photos_survey ON public.site_survey_photos(survey_id);

-- Storage policies for the site-survey-media bucket
CREATE POLICY "Authenticated read site-survey-media"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'site-survey-media');

CREATE POLICY "Authenticated upload site-survey-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-survey-media');

CREATE POLICY "Authenticated update site-survey-media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'site-survey-media');

CREATE POLICY "Authenticated delete site-survey-media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'site-survey-media');
