
-- Table for rich text field reports
CREATE TABLE public.field_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.field_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all field reports"
  ON public.field_reports FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view field reports for assigned jobs"
  ON public.field_reports FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM job_assignments ja
    WHERE ja.job_id = field_reports.job_id AND ja.engineer_id = auth.uid()
  ));

CREATE POLICY "Engineers can create field reports for assigned jobs"
  ON public.field_reports FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM job_assignments ja
      WHERE ja.job_id = field_reports.job_id AND ja.engineer_id = auth.uid()
    )
  );

CREATE POLICY "Engineers can update own field reports"
  ON public.field_reports FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM job_assignments ja
      WHERE ja.job_id = field_reports.job_id AND ja.engineer_id = auth.uid()
    )
  )
  WITH CHECK (
    author_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM job_assignments ja
      WHERE ja.job_id = field_reports.job_id AND ja.engineer_id = auth.uid()
    )
  );

CREATE POLICY "Engineers can delete own field reports"
  ON public.field_reports FOR DELETE TO authenticated
  USING (
    author_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM job_assignments ja
      WHERE ja.job_id = field_reports.job_id AND ja.engineer_id = auth.uid()
    )
  );

CREATE TRIGGER update_field_reports_updated_at
  BEFORE UPDATE ON public.field_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table for submission comments
CREATE TABLE public.submission_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.submission_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all comments"
  ON public.submission_comments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view comments on own job submissions"
  ON public.submission_comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM submissions s
    JOIN job_assignments ja ON ja.job_id = s.job_id
    WHERE s.id = submission_comments.submission_id AND ja.engineer_id = auth.uid()
  ));

CREATE POLICY "Engineers can create comments on own job submissions"
  ON public.submission_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM submissions s
      JOIN job_assignments ja ON ja.job_id = s.job_id
      WHERE s.id = submission_comments.submission_id AND ja.engineer_id = auth.uid()
    )
  );

CREATE POLICY "Engineers can update own comments"
  ON public.submission_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Engineers can delete own comments"
  ON public.submission_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid());

CREATE TRIGGER update_submission_comments_updated_at
  BEFORE UPDATE ON public.submission_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
