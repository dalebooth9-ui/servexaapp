
-- Table to store which document types auto-attach per job category
CREATE TABLE public.category_document_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_slug text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('rams_pdf', 'blank_job_sheet', 'uploaded_file')),
  label text NOT NULL DEFAULT '',
  file_url text NULL,
  file_name text NULL,
  description text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.category_document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage category document templates"
  ON public.category_document_templates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view category document templates"
  ON public.category_document_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Updated_at trigger
CREATE TRIGGER update_category_document_templates_updated_at
  BEFORE UPDATE ON public.category_document_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table to track auto-attached documents per job (so we record what was attached at creation)
CREATE TABLE public.job_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  label text NOT NULL DEFAULT '',
  file_url text NULL,
  file_name text NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('auto', 'manual')),
  category_template_id uuid NULL REFERENCES public.category_document_templates(id) ON DELETE SET NULL,
  created_by uuid NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.job_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all job documents"
  ON public.job_documents FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view job documents for assigned jobs"
  ON public.job_documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM job_assignments ja
    WHERE ja.job_id = job_documents.job_id AND ja.engineer_id = auth.uid()
  ));
