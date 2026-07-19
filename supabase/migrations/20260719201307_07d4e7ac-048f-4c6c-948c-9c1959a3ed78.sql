
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS multi_day_flagged_at timestamptz;

CREATE TABLE IF NOT EXISTS public.job_completion_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  engineer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (reason IN ('no_access','multi_day','parts_required','office_told_me','other')),
  note text,
  moved_to_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jcf_job ON public.job_completion_flags(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jcf_engineer ON public.job_completion_flags(engineer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jcf_org ON public.job_completion_flags(org_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_completion_flags TO authenticated;
GRANT ALL ON public.job_completion_flags TO service_role;

ALTER TABLE public.job_completion_flags ENABLE ROW LEVEL SECURITY;

-- Deny when org suspended (restrictive, mirrors other tables)
CREATE POLICY "deny_when_org_suspended" ON public.job_completion_flags
  AS RESTRICTIVE
  TO authenticated
  USING (is_org_active(get_user_org_id()))
  WITH CHECK (is_org_active(get_user_org_id()));

-- Engineers can insert flags for themselves
CREATE POLICY "engineers_insert_own_flags" ON public.job_completion_flags
  FOR INSERT TO authenticated
  WITH CHECK (
    engineer_id = auth.uid()
    AND org_id = get_user_org_id()
  );

-- Engineers can read their own flags
CREATE POLICY "engineers_read_own_flags" ON public.job_completion_flags
  FOR SELECT TO authenticated
  USING (engineer_id = auth.uid());

-- Admins in the same org can do everything
CREATE POLICY "admins_manage_flags" ON public.job_completion_flags
  FOR ALL TO authenticated
  USING (has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE TRIGGER trg_jcf_updated_at
  BEFORE UPDATE ON public.job_completion_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
