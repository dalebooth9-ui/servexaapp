
-- Installation Projects table
CREATE TABLE public.installation_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  reference text NOT NULL DEFAULT '',
  client_name text NOT NULL DEFAULT '',
  company_name text NOT NULL DEFAULT '',
  company_address text,
  company_phone text,
  company_email text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.installation_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage all installation projects" ON public.installation_projects FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Engineers can manage installation projects for assigned jobs" ON public.installation_projects FOR ALL USING (EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = installation_projects.job_id AND ja.engineer_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = installation_projects.job_id AND ja.engineer_id = auth.uid()));
CREATE TRIGGER update_installation_projects_updated_at BEFORE UPDATE ON public.installation_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Installation Issues table
CREATE TABLE public.installation_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.installation_projects(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text,
  status text NOT NULL DEFAULT 'open',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.installation_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage all installation issues" ON public.installation_issues FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Engineers can manage issues for assigned job projects" ON public.installation_issues FOR ALL USING (EXISTS (SELECT 1 FROM public.installation_projects p JOIN public.job_assignments ja ON ja.job_id = p.job_id WHERE p.id = installation_issues.project_id AND ja.engineer_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.installation_projects p JOIN public.job_assignments ja ON ja.job_id = p.job_id WHERE p.id = installation_issues.project_id AND ja.engineer_id = auth.uid()));
CREATE TRIGGER update_installation_issues_updated_at BEFORE UPDATE ON public.installation_issues FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Installation Issue Photos table
CREATE TABLE public.installation_issue_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.installation_issues(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  file_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.installation_issue_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage all issue photos" ON public.installation_issue_photos FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Engineers can manage photos for assigned job issues" ON public.installation_issue_photos FOR ALL USING (EXISTS (SELECT 1 FROM public.installation_issues i JOIN public.installation_projects p ON p.id = i.project_id JOIN public.job_assignments ja ON ja.job_id = p.job_id WHERE i.id = installation_issue_photos.issue_id AND ja.engineer_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.installation_issues i JOIN public.installation_projects p ON p.id = i.project_id JOIN public.job_assignments ja ON ja.job_id = p.job_id WHERE i.id = installation_issue_photos.issue_id AND ja.engineer_id = auth.uid()));

-- Storage bucket for installation photos
INSERT INTO storage.buckets (id, name, public) VALUES ('installation-photos', 'installation-photos', false);
CREATE POLICY "Auth users can upload installation photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'installation-photos' AND auth.uid() IS NOT NULL);
CREATE POLICY "Auth users can view installation photos" ON storage.objects FOR SELECT USING (bucket_id = 'installation-photos' AND auth.uid() IS NOT NULL);
CREATE POLICY "Auth users can delete installation photos" ON storage.objects FOR DELETE USING (bucket_id = 'installation-photos' AND auth.uid() IS NOT NULL);
