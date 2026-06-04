ALTER TABLE public.job_schedule
  ADD COLUMN IF NOT EXISTS last_modified_by uuid,
  ADD COLUMN IF NOT EXISTS last_modified_at timestamptz;

ALTER PUBLICATION supabase_realtime SET (publish = 'insert, update, delete');
ALTER TABLE public.job_schedule REPLICA IDENTITY FULL;