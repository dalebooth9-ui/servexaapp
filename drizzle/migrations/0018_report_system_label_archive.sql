ALTER TABLE public.job_sheet_responses ADD COLUMN IF NOT EXISTS system_label text, ADD COLUMN IF NOT EXISTS archived_at timestamptz;
COMMENT ON COLUMN public.job_sheet_responses.system_label IS 'Editable per-system label, e.g. System 1 of 3';
COMMENT ON COLUMN public.job_sheet_responses.archived_at IS 'Set aside (hidden from engineer/office lists) without deleting';