ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS paperwork_review_note text;