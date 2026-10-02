CREATE TYPE public.site_visit_outcome AS ENUM ('completed','partly_completed','not_completed','investigation_only');
CREATE TYPE public.site_visit_report_status AS ENUM ('draft','reviewed','approved');

CREATE TABLE public.site_visit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT public.get_user_org_id() REFERENCES public.organisations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL DEFAULT '',
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  attended_by text,
  site_name text,
  site_address text,
  client_name text,
  source_job_sheet_id uuid REFERENCES public.job_sheet_responses(id) ON DELETE SET NULL,
  work_instructed text,
  outcome public.site_visit_outcome,
  outcome_reason text,
  return_visit_required boolean NOT NULL DEFAULT false,
  parts_required text,
  site_contact_name text,
  site_contact_title text,
  raw_notes text,
  summary text,
  system_description text,
  reason_for_visit text,
  event_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  conclusion text,
  possible_causes jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  closing_note text,
  gaps_to_confirm jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.site_visit_report_status NOT NULL DEFAULT 'draft',
  reviewed_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK (jsonb_typeof(event_log) = 'array'),
  CHECK (jsonb_typeof(findings) = 'array'),
  CHECK (jsonb_typeof(possible_causes) = 'array'),
  CHECK (jsonb_typeof(recommendations) = 'array'),
  CHECK (jsonb_typeof(gaps_to_confirm) = 'array')
);
COMMENT ON COLUMN public.site_visit_reports.findings IS 'Array of {id uuid (stable), heading, text}. Photos link via id.';
COMMENT ON COLUMN public.site_visit_reports.recommendations IS 'Array of {id uuid, action, owner_type us|client|third_party, owner_name, status open|done, defect_id uuid|null}';
COMMENT ON COLUMN public.site_visit_reports.event_log IS 'Array of {date, time, source, what_was_recorded, note}';
CREATE INDEX site_visit_reports_job_idx ON public.site_visit_reports(job_id);
CREATE INDEX site_visit_reports_org_idx ON public.site_visit_reports(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_visit_reports TO authenticated;
GRANT ALL ON public.site_visit_reports TO service_role;
ALTER TABLE public.site_visit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY deny_when_org_suspended ON public.site_visit_reports AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_org_active(public.get_user_org_id())) WITH CHECK (public.is_org_active(public.get_user_org_id()));
CREATE POLICY "Admins manage site visit reports in org" ON public.site_visit_reports FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.org_id = public.get_user_org_id()));
CREATE POLICY "Engineers view site visit reports on assigned jobs" ON public.site_visit_reports FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
    AND (created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = site_visit_reports.job_id AND ja.engineer_id = auth.uid())));
CREATE POLICY "Engineers create site visit reports on assigned jobs" ON public.site_visit_reports FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
    AND EXISTS (SELECT 1 FROM public.job_assignments ja JOIN public.jobs j ON j.id = ja.job_id
      WHERE ja.job_id = site_visit_reports.job_id AND ja.engineer_id = auth.uid() AND j.org_id = public.get_user_org_id()));
CREATE POLICY "Engineers edit site visit reports on assigned jobs" ON public.site_visit_reports FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
    AND EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = site_visit_reports.job_id AND ja.engineer_id = auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'engineer')
    AND EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = site_visit_reports.job_id AND ja.engineer_id = auth.uid()));

-- Photos: link to existing job photo storage (submissions) with stable id + caption + optional finding link
CREATE TABLE public.site_visit_report_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT public.get_user_org_id() REFERENCES public.organisations(id) ON DELETE CASCADE,
  report_id uuid NOT NULL REFERENCES public.site_visit_reports(id) ON DELETE CASCADE,
  submission_id uuid REFERENCES public.submissions(id) ON DELETE SET NULL,
  storage_ref text NOT NULL,
  caption text NOT NULL DEFAULT '',
  finding_id uuid,
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.site_visit_report_photos.finding_id IS 'Stable id of a row in site_visit_reports.findings; null = general photo';
COMMENT ON COLUMN public.site_visit_report_photos.storage_ref IS 'Durable storage ref (storage://bucket/path) of the existing job photo; never a copy';
CREATE INDEX site_visit_report_photos_report_idx ON public.site_visit_report_photos(report_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_visit_report_photos TO authenticated;
GRANT ALL ON public.site_visit_report_photos TO service_role;
ALTER TABLE public.site_visit_report_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY deny_when_org_suspended ON public.site_visit_report_photos AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_org_active(public.get_user_org_id())) WITH CHECK (public.is_org_active(public.get_user_org_id()));
CREATE POLICY "Access photos via parent report" ON public.site_visit_report_photos FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND EXISTS (SELECT 1 FROM public.site_visit_reports r WHERE r.id = report_id))
  WITH CHECK (org_id = public.get_user_org_id() AND EXISTS (SELECT 1 FROM public.site_visit_reports r WHERE r.id = report_id AND r.org_id = public.get_user_org_id()));

CREATE OR REPLACE FUNCTION public.site_visit_reports_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER site_visit_reports_touch BEFORE UPDATE ON public.site_visit_reports FOR EACH ROW EXECUTE FUNCTION public.site_visit_reports_touch();
CREATE TRIGGER site_visit_report_photos_touch BEFORE UPDATE ON public.site_visit_report_photos FOR EACH ROW EXECUTE FUNCTION public.site_visit_reports_touch();