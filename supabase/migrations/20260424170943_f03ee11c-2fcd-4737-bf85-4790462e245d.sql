-- Per-job template lock: pins one template per category bucket on a job
CREATE TABLE public.job_template_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  template_id uuid NOT NULL REFERENCES public.job_sheet_templates(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, bucket)
);

CREATE INDEX idx_job_template_locks_job ON public.job_template_locks(job_id);

-- Validate bucket values
CREATE OR REPLACE FUNCTION public.validate_job_template_lock_bucket()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.bucket NOT IN ('pressure_test', 'visual', 'other') THEN
    RAISE EXCEPTION 'Invalid bucket: %. Must be pressure_test, visual, or other.', NEW.bucket;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_job_template_lock_bucket_trigger
  BEFORE INSERT OR UPDATE ON public.job_template_locks
  FOR EACH ROW EXECUTE FUNCTION public.validate_job_template_lock_bucket();

CREATE TRIGGER update_job_template_locks_updated_at
  BEFORE UPDATE ON public.job_template_locks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.job_template_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all job_template_locks"
  ON public.job_template_locks
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view org job_template_locks"
  ON public.job_template_locks
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'engineer'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_template_locks.job_id
        AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)
    )
  );