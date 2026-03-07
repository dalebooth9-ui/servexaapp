
-- 1. Add priority, area, and assignee_id to installation_issues
ALTER TABLE public.installation_issues
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS assignee_id uuid,
  ADD COLUMN IF NOT EXISTS resolution_photo_url text,
  ADD COLUMN IF NOT EXISTS resolution_photo_file_name text;

-- Validate priority values
CREATE OR REPLACE FUNCTION public.validate_issue_priority()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.priority NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Invalid priority: %. Must be low, medium, high, or critical.', NEW.priority;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_issue_priority_trigger ON public.installation_issues;
CREATE TRIGGER validate_issue_priority_trigger
  BEFORE INSERT OR UPDATE ON public.installation_issues
  FOR EACH ROW EXECUTE FUNCTION public.validate_issue_priority();

-- 2. Create pre_completion_checklist_items table (template items)
CREATE TABLE IF NOT EXISTS public.pre_completion_checklist_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  sort_order integer NOT NULL DEFAULT 0,
  checked boolean NOT NULL DEFAULT false,
  checked_by uuid,
  checked_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pre_completion_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pre-completion checklist"
  ON public.pre_completion_checklist_items FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view and update pre-completion checklist for assigned jobs"
  ON public.pre_completion_checklist_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.job_assignments ja
    WHERE ja.job_id = pre_completion_checklist_items.job_id
      AND ja.engineer_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.job_assignments ja
    WHERE ja.job_id = pre_completion_checklist_items.job_id
      AND ja.engineer_id = auth.uid()
  ));

CREATE TRIGGER update_pre_completion_checklist_updated_at
  BEFORE UPDATE ON public.pre_completion_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Index for performance
CREATE INDEX IF NOT EXISTS idx_pre_completion_checklist_job_id
  ON public.pre_completion_checklist_items(job_id);

CREATE INDEX IF NOT EXISTS idx_installation_issues_area
  ON public.installation_issues(area);
