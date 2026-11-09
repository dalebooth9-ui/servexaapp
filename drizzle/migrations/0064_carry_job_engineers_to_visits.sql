ALTER TABLE public.job_visits ADD COLUMN IF NOT EXISTS extra_engineer_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.job_visits ADD COLUMN IF NOT EXISTS auto_engineer_ids uuid[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.job_visits.extra_engineer_ids IS 'Additional engineers on the visit besides engineer_id';
COMMENT ON COLUMN public.job_visits.auto_engineer_ids IS 'Engineers set on this visit automatically from job assignments';

CREATE OR REPLACE FUNCTION public.visit_is_open(v public.job_visits)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT v.status = 'upcoming' AND v.completed_at IS NULL AND v.scheduled_date >= (now() AT TIME ZONE 'Europe/London')::date
$$;

-- Planner sync covering every engineer on the visit
CREATE OR REPLACE FUNCTION public.sync_job_visit_to_schedule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_set uuid[] := '{}'; new_set uuid[] := '{}'; e uuid;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    old_set := array_remove(array_prepend(OLD.engineer_id, OLD.extra_engineer_ids), NULL);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.status <> 'cancelled' AND NEW.scheduled_date IS NOT NULL THEN
    new_set := array_remove(array_prepend(NEW.engineer_id, NEW.extra_engineer_ids), NULL);
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    FOREACH e IN ARRAY old_set LOOP
      IF TG_OP = 'DELETE' OR NOT (e = ANY(new_set)) OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
        DELETE FROM job_schedule s
         WHERE s.job_id = OLD.job_id AND s.engineer_id = e AND s.schedule_date = OLD.scheduled_date
           AND NOT EXISTS (SELECT 1 FROM job_visits v WHERE v.id <> OLD.id AND v.job_id = OLD.job_id
                           AND (v.engineer_id = e OR e = ANY(v.extra_engineer_ids))
                           AND v.scheduled_date = OLD.scheduled_date AND v.status <> 'cancelled');
      END IF;
    END LOOP;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  FOREACH e IN ARRAY new_set LOOP
    INSERT INTO job_schedule (job_id, engineer_id, schedule_date, created_by, org_id)
    SELECT NEW.job_id, e, NEW.scheduled_date, auth.uid(), j.org_id FROM jobs j WHERE j.id = NEW.job_id
    ON CONFLICT (job_id, engineer_id, schedule_date) DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;

-- New visits default to the job's assigned engineers
CREATE OR REPLACE FUNCTION public.default_visit_engineers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ids uuid[];
BEGIN
  IF NEW.engineer_id IS NOT NULL OR coalesce(NEW.status,'upcoming') <> 'upcoming' THEN RETURN NEW; END IF;
  SELECT array_agg(a.engineer_id ORDER BY a.assigned_at) INTO ids FROM job_assignments a WHERE a.job_id = NEW.job_id;
  IF ids IS NULL OR array_length(ids,1) = 0 THEN RETURN NEW; END IF;
  NEW.engineer_id := ids[1];
  NEW.extra_engineer_ids := ids[2:];
  NEW.auto_engineer_ids := ids;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_default_visit_engineers ON public.job_visits;
CREATE TRIGGER trg_default_visit_engineers BEFORE INSERT ON public.job_visits
FOR EACH ROW EXECUTE FUNCTION public.default_visit_engineers();

-- Assignment added / removed
CREATE OR REPLACE FUNCTION public.carry_assignment_to_visits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE remaining uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- unassigned upcoming visits
    UPDATE job_visits v SET engineer_id = NEW.engineer_id, auto_engineer_ids = ARRAY[NEW.engineer_id], updated_at = now()
     WHERE v.job_id = NEW.job_id AND v.engineer_id IS NULL AND public.visit_is_open(v);
    -- visits set automatically from other assigned engineers: add this one too
    UPDATE job_visits v SET extra_engineer_ids = array_append(v.extra_engineer_ids, NEW.engineer_id),
           auto_engineer_ids = array_append(v.auto_engineer_ids, NEW.engineer_id), updated_at = now()
     WHERE v.job_id = NEW.job_id AND v.engineer_id IS NOT NULL AND v.engineer_id = ANY(v.auto_engineer_ids)
       AND v.engineer_id <> NEW.engineer_id AND NOT (NEW.engineer_id = ANY(v.extra_engineer_ids))
       AND public.visit_is_open(v);
    RETURN NEW;
  END IF;
  -- DELETE: remove from upcoming visits only where set automatically
  UPDATE job_visits v SET
     engineer_id = (array_remove(array_prepend(v.engineer_id, v.extra_engineer_ids), OLD.engineer_id))[1],
     extra_engineer_ids = coalesce((array_remove(array_prepend(v.engineer_id, v.extra_engineer_ids), OLD.engineer_id))[2:], '{}'),
     auto_engineer_ids = array_remove(v.auto_engineer_ids, OLD.engineer_id), updated_at = now()
   WHERE v.job_id = OLD.job_id AND OLD.engineer_id = ANY(v.auto_engineer_ids)
     AND (v.engineer_id = OLD.engineer_id OR OLD.engineer_id = ANY(v.extra_engineer_ids))
     AND public.visit_is_open(v);
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_carry_assignment_to_visits ON public.job_assignments;
CREATE TRIGGER trg_carry_assignment_to_visits AFTER INSERT OR DELETE ON public.job_assignments
FOR EACH ROW EXECUTE FUNCTION public.carry_assignment_to_visits();