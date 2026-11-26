ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS time_window text,
  ADD COLUMN IF NOT EXISTS call_ahead_minutes integer,
  ADD COLUMN IF NOT EXISTS access_contact_name text,
  ADD COLUMN IF NOT EXISTS access_contact_phone text,
  ADD COLUMN IF NOT EXISTS access_notes text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS two_engineer_ok boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS jobs_tags_gin ON public.jobs USING gin(tags);

CREATE TABLE public.cheat_sheet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  section text NOT NULL,
  title text NOT NULL,
  body text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cheat_sheet_entries TO authenticated;
GRANT ALL ON public.cheat_sheet_entries TO service_role;
ALTER TABLE public.cheat_sheet_entries ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_cheat_sheet_force_org_id BEFORE INSERT ON public.cheat_sheet_entries FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();
CREATE POLICY cheat_sheet_read ON public.cheat_sheet_entries FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());
CREATE POLICY cheat_sheet_admin_write ON public.cheat_sheet_entries FOR ALL TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE TABLE public.job_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  note text NOT NULL,
  done_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_follow_ups_due_idx ON public.job_follow_ups(org_id, due_date) WHERE done_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_follow_ups TO authenticated;
GRANT ALL ON public.job_follow_ups TO service_role;
ALTER TABLE public.job_follow_ups ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_job_follow_ups_force_org_id BEFORE INSERT ON public.job_follow_ups FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();
CREATE POLICY job_follow_ups_admin_all ON public.job_follow_ups FOR ALL TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.org_id = job_follow_ups.org_id));