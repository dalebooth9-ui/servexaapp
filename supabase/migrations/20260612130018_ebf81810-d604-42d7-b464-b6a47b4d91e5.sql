
CREATE TABLE public.rams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  site_name text,
  client_name text,
  site_address text,
  works_description text,
  factors jsonb NOT NULL DEFAULT jsonb_build_object(
    'working_at_height', false,
    'hot_works', false,
    'confined_space', false,
    'asbestos_present', false,
    'live_systems', false,
    'occupied_building', false,
    'lone_working', false,
    'manual_handling', false
  ),
  risk_assessment jsonb NOT NULL DEFAULT '[]'::jsonb,
  method_statement jsonb NOT NULL DEFAULT jsonb_build_object(
    'sequence', '[]'::jsonb,
    'ppe', '[]'::jsonb,
    'plant_equipment', '[]'::jsonb,
    'emergency_arrangements', '',
    'welfare', ''
  ),
  status text NOT NULL DEFAULT 'Draft',
  reviewed_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX rams_job_id_idx ON public.rams(job_id);
CREATE INDEX rams_status_idx ON public.rams(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rams TO authenticated;
GRANT ALL ON public.rams TO service_role;

ALTER TABLE public.rams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view RAMS"
  ON public.rams FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can create RAMS"
  ON public.rams FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Author or admin can update RAMS"
  ON public.rams FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete RAMS"
  ON public.rams FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Validation + approval trigger
CREATE OR REPLACE FUNCTION public.validate_rams()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('Draft','Reviewed','Approved') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be Draft, Reviewed or Approved.', NEW.status;
  END IF;

  IF NEW.status = 'Approved' THEN
    IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Only admins can approve RAMS';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status <> 'Approved' THEN
      NEW.approved_by := auth.uid();
      NEW.approved_at := now();
    ELSIF TG_OP = 'INSERT' THEN
      NEW.approved_by := auth.uid();
      NEW.approved_at := now();
    END IF;
  ELSE
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;

  IF NEW.status = 'Reviewed' AND TG_OP = 'UPDATE' AND OLD.status <> 'Reviewed' THEN
    NEW.reviewed_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER rams_validate
BEFORE INSERT OR UPDATE ON public.rams
FOR EACH ROW EXECUTE FUNCTION public.validate_rams();

CREATE TRIGGER rams_set_updated_at
BEFORE UPDATE ON public.rams
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
