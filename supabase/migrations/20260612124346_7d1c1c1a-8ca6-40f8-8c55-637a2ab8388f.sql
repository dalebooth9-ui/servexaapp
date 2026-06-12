
CREATE TABLE public.generic_rams (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  contract_name text,
  site_name text,
  client text,
  description text,
  factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  sequence_of_works jsonb NOT NULL DEFAULT '[]'::jsonb,
  ppe jsonb NOT NULL DEFAULT '[]'::jsonb,
  plant_equipment jsonb NOT NULL DEFAULT '[]'::jsonb,
  emergency_arrangements text,
  status text NOT NULL DEFAULT 'draft',
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generic_rams TO authenticated;
GRANT ALL ON public.generic_rams TO service_role;

ALTER TABLE public.generic_rams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage generic RAMS in their org"
  ON public.generic_rams FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = generic_rams.job_id
                AND (j.org_id = public.get_user_org_id() OR j.org_id IS NULL))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = generic_rams.job_id
                AND (j.org_id = public.get_user_org_id() OR j.org_id IS NULL))
  );

CREATE POLICY "Engineers view generic RAMS for assigned jobs"
  ON public.generic_rams FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.job_assignments ja
            WHERE ja.job_id = generic_rams.job_id AND ja.engineer_id = auth.uid())
  );

CREATE INDEX generic_rams_job_id_idx ON public.generic_rams(job_id);

CREATE OR REPLACE FUNCTION public.validate_generic_rams()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('draft','reviewed','approved') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  -- Approval restricted to admin
  IF NEW.status = 'approved' THEN
    IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Only admins can approve RAMS';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status <> 'approved' THEN
      NEW.approved_by := auth.uid();
      NEW.approved_at := now();
    END IF;
  ELSE
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER generic_rams_validate
  BEFORE INSERT OR UPDATE ON public.generic_rams
  FOR EACH ROW EXECUTE FUNCTION public.validate_generic_rams();

CREATE TRIGGER generic_rams_updated_at
  BEFORE UPDATE ON public.generic_rams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
