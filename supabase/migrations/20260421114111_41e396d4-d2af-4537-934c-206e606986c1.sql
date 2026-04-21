-- Add a (logical) FK relationship from job_activity_log.user_id to profiles.user_id
-- so PostgREST can embed and sort by actor name.
-- Note: profiles.user_id has a UNIQUE constraint, which makes this valid as a FK target.
-- We use ON DELETE SET NULL because user_id may be null already (system actions).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.job_activity_log'::regclass
      AND conname = 'job_activity_log_user_id_profiles_fkey'
  ) THEN
    ALTER TABLE public.job_activity_log
      ADD CONSTRAINT job_activity_log_user_id_profiles_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(user_id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Helpful indexes for sorting and joining
CREATE INDEX IF NOT EXISTS idx_job_activity_log_user_id ON public.job_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_job_activity_log_job_id ON public.job_activity_log(job_id);
CREATE INDEX IF NOT EXISTS idx_job_activity_log_action_created ON public.job_activity_log(action, created_at DESC);