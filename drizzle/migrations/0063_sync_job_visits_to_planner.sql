CREATE OR REPLACE FUNCTION public.sync_job_visit_to_schedule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.engineer_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR NEW.engineer_id IS DISTINCT FROM OLD.engineer_id
          OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date OR NEW.status = 'cancelled') THEN
    DELETE FROM job_schedule s
     WHERE s.job_id = OLD.job_id AND s.engineer_id = OLD.engineer_id AND s.schedule_date = OLD.scheduled_date
       AND NOT EXISTS (SELECT 1 FROM job_visits v WHERE v.id <> OLD.id AND v.job_id = OLD.job_id
                       AND v.engineer_id = OLD.engineer_id AND v.scheduled_date = OLD.scheduled_date
                       AND v.status <> 'cancelled');
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.engineer_id IS NOT NULL AND NEW.scheduled_date IS NOT NULL AND NEW.status <> 'cancelled' THEN
    INSERT INTO job_schedule (job_id, engineer_id, schedule_date, created_by, org_id)
    SELECT NEW.job_id, NEW.engineer_id, NEW.scheduled_date, auth.uid(), j.org_id FROM jobs j WHERE j.id = NEW.job_id
    ON CONFLICT (job_id, engineer_id, schedule_date) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_job_visit_to_schedule ON public.job_visits;
CREATE TRIGGER trg_sync_job_visit_to_schedule AFTER INSERT OR UPDATE OR DELETE ON public.job_visits
FOR EACH ROW EXECUTE FUNCTION public.sync_job_visit_to_schedule();

INSERT INTO job_schedule (job_id, engineer_id, schedule_date, org_id)
SELECT v.job_id, v.engineer_id, v.scheduled_date, j.org_id FROM job_visits v JOIN jobs j ON j.id = v.job_id
WHERE v.engineer_id IS NOT NULL AND v.status = 'upcoming' AND v.scheduled_date >= current_date - 7
ON CONFLICT (job_id, engineer_id, schedule_date) DO NOTHING;