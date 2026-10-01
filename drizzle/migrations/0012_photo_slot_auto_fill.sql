ALTER TABLE public.job_photo_checklist_responses
  ADD COLUMN IF NOT EXISTS auto_filled_fields text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS auto_fill_dismissed text[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.job_photo_checklist_responses.auto_filled_fields IS 'Slot fields (before_photo_url/after_photo_url) filled automatically from job photos';
COMMENT ON COLUMN public.job_photo_checklist_responses.auto_fill_dismissed IS 'Slot fields the engineer cleared; never auto-fill again';
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_photo_checklist_responses;