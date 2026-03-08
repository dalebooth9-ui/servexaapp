
-- Photo checklist templates (admin creates, linked to job categories)
CREATE TABLE public.photo_checklist_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.photo_checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage photo checklist templates"
  ON public.photo_checklist_templates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view photo checklist templates"
  ON public.photo_checklist_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Items within a template
CREATE TABLE public.photo_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.photo_checklist_templates(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  item_type TEXT NOT NULL DEFAULT 'photo', -- photo, before_after, checkbox, text
  label TEXT NOT NULL,
  description TEXT,
  required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.photo_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage photo checklist items"
  ON public.photo_checklist_items FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view photo checklist items"
  ON public.photo_checklist_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Job instance of a completed/in-progress checklist
CREATE TABLE public.job_photo_checklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.photo_checklist_templates(id),
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress, completed
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.job_photo_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all job photo checklists"
  ON public.job_photo_checklists FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can manage checklists for assigned jobs"
  ON public.job_photo_checklists FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.job_assignments ja
    WHERE ja.job_id = job_photo_checklists.job_id AND ja.engineer_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.job_assignments ja
    WHERE ja.job_id = job_photo_checklists.job_id AND ja.engineer_id = auth.uid()
  ));

-- Individual item responses (photos, answers)
CREATE TABLE public.job_photo_checklist_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checklist_id UUID NOT NULL REFERENCES public.job_photo_checklists(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.photo_checklist_items(id),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  response_type TEXT NOT NULL DEFAULT 'photo', -- photo, before_after, checkbox, text
  photo_url TEXT,
  before_photo_url TEXT,
  after_photo_url TEXT,
  text_value TEXT,
  is_pass BOOLEAN,
  notes TEXT,
  captured_by UUID,
  captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.job_photo_checklist_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all photo responses"
  ON public.job_photo_checklist_responses FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can manage responses for assigned jobs"
  ON public.job_photo_checklist_responses FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.job_assignments ja
    WHERE ja.job_id = job_photo_checklist_responses.job_id AND ja.engineer_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.job_assignments ja
    WHERE ja.job_id = job_photo_checklist_responses.job_id AND ja.engineer_id = auth.uid()
  ));

-- Triggers
CREATE TRIGGER update_photo_checklist_templates_updated_at
  BEFORE UPDATE ON public.photo_checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_photo_checklists_updated_at
  BEFORE UPDATE ON public.job_photo_checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_job_photo_checklists_job_id ON public.job_photo_checklists(job_id);
CREATE INDEX idx_job_photo_checklist_responses_checklist_id ON public.job_photo_checklist_responses(checklist_id);
