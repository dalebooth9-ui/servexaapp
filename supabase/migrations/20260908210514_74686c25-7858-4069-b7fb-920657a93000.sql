CREATE OR REPLACE FUNCTION public.auto_attach_rams_on_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.rams_autoattach_map%ROWTYPE;
BEGIN
  IF NEW.category IS NULL OR NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO m FROM public.rams_autoattach_map
  WHERE org_id = NEW.org_id AND category_slug = NEW.category
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF m.source_kind = 'rams_documents' THEN
    INSERT INTO public.rams_documents (
      job_id, rams_type, created_by, contract_job_name, assessment_date, client, attendance_date,
      site_location, operatives, description_of_work, sequence_of_ops, task_specific_ops, location,
      resources, personnel, plant_and_equipment, significant_risks, special_training, ppe_items,
      risk_rows, org_id, shareable_with_customer, hazard_modules
    )
    SELECT NEW.id, d.rams_type, NEW.created_by, d.contract_job_name, NULL, d.client, NULL,
      d.site_location, d.operatives, d.description_of_work, d.sequence_of_ops, d.task_specific_ops, d.location,
      d.resources, d.personnel, d.plant_and_equipment, d.significant_risks, d.special_training, d.ppe_items,
      d.risk_rows, NEW.org_id, false, d.hazard_modules
    FROM public.rams_documents d WHERE d.id = m.source_id;

  ELSIF m.source_kind = 'rams' THEN
    INSERT INTO public.rams (
      job_id, created_by, site_name, client_name, site_address, works_description,
      factors, risk_assessment, method_statement, status, version, org_id
    )
    SELECT NEW.id, NEW.created_by, r.site_name, r.client_name, r.site_address, r.works_description,
      r.factors, r.risk_assessment, r.method_statement, 'draft', 1, NEW.org_id
    FROM public.rams r WHERE r.id = m.source_id;

  ELSIF m.source_kind = 'generic_rams' THEN
    INSERT INTO public.generic_rams (
      job_id, created_by, contract_name, site_name, client, description, factors, risk_rows,
      sequence_of_works, ppe, plant_equipment, emergency_arrangements, status, org_id
    )
    SELECT NEW.id, NEW.created_by, g.contract_name, g.site_name, g.client, g.description, g.factors, g.risk_rows,
      g.sequence_of_works, g.ppe, g.plant_equipment, g.emergency_arrangements, 'draft', NEW.org_id
    FROM public.generic_rams g WHERE g.id = m.source_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block job creation because of an auto-attach problem.
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_attach_rams_on_job() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_auto_attach_rams ON public.jobs;
CREATE TRIGGER trg_auto_attach_rams
AFTER INSERT ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.auto_attach_rams_on_job();