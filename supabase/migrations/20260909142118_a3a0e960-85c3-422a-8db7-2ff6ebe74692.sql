-- Keep job_assignments in sync with job_schedule so engineers can see scheduled jobs (RLS depends on assignments).
CREATE OR REPLACE FUNCTION public.sync_job_assignment_from_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.engineer_id IS NOT NULL THEN
    SELECT org_id INTO v_org FROM public.jobs WHERE id = NEW.job_id;
    INSERT INTO public.job_assignments (job_id, engineer_id, org_id)
    VALUES (NEW.job_id, NEW.engineer_id, COALESCE(v_org, NEW.org_id))
    ON CONFLICT (job_id, engineer_id) DO NOTHING;
  END IF;

  IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') AND OLD.engineer_id IS NOT NULL THEN
    IF TG_OP = 'DELETE'
       OR OLD.engineer_id IS DISTINCT FROM NEW.engineer_id
       OR OLD.job_id IS DISTINCT FROM NEW.job_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.job_schedule s
        WHERE s.job_id = OLD.job_id
          AND s.engineer_id = OLD.engineer_id
          AND s.id <> OLD.id
      ) THEN
        DELETE FROM public.job_assignments a
        WHERE a.job_id = OLD.job_id AND a.engineer_id = OLD.engineer_id;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_job_assignment_from_schedule ON public.job_schedule;
CREATE TRIGGER trg_sync_job_assignment_from_schedule
AFTER INSERT OR UPDATE OR DELETE ON public.job_schedule
FOR EACH ROW EXECUTE FUNCTION public.sync_job_assignment_from_schedule();

-- Backfill orphaned schedule rows.
INSERT INTO public.job_assignments (job_id, engineer_id, org_id)
SELECT DISTINCT s.job_id, s.engineer_id, j.org_id
FROM public.job_schedule s
JOIN public.jobs j ON j.id = s.job_id
WHERE s.engineer_id IS NOT NULL
ON CONFLICT (job_id, engineer_id) DO NOTHING;