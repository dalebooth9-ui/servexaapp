CREATE OR REPLACE FUNCTION public.auto_create_fire_log_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry_type text := 'other';
  v_recorded_by text;
  v_title_lower text;
BEGIN
  IF (TG_OP = 'UPDATE') AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' AND NEW.site_id IS NOT NULL THEN
    v_title_lower := lower(coalesce(NEW.name, '') || ' ' || coalesce(NEW.category, ''));
    IF v_title_lower !~ 'fire|alarm|extinguisher|sprinkler|riser|suppression|emergency light|evacuation' THEN
      RETURN NEW;
    END IF;
    IF v_title_lower ~ 'inspect|visual' THEN v_entry_type := 'inspection';
    ELSIF v_title_lower ~ 'test' THEN v_entry_type := 'test';
    ELSIF v_title_lower ~ 'repair|fix' THEN v_entry_type := 'repair';
    ELSIF v_title_lower ~ 'fault' THEN v_entry_type := 'fault';
    ELSIF v_title_lower ~ 'drill|evacuat' THEN v_entry_type := 'evacuation_drill';
    ELSIF v_title_lower ~ 'maint|service|ppm' THEN v_entry_type := 'maintenance';
    END IF;
    SELECT full_name INTO v_recorded_by FROM public.profiles WHERE user_id = auth.uid();
    INSERT INTO public.fire_log_entries (
      org_id, site_id, entry_type, title, description,
      date_of_event, recorded_by, linked_job_id, created_by
    ) VALUES (
      NEW.org_id, NEW.site_id, v_entry_type,
      COALESCE(NULLIF(NEW.name, ''), NEW.reference_number, 'Fire safety job completed'),
      NEW.brief,
      CURRENT_DATE,
      COALESCE(v_recorded_by, 'System'),
      NEW.id,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_admins_on_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_record RECORD;
  engineer_name text;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.org_id IS NOT NULL THEN
    SELECT p.full_name INTO engineer_name FROM profiles p WHERE p.user_id = auth.uid();
    FOR admin_record IN
      SELECT DISTINCT user_id FROM user_roles WHERE role = 'admin' AND org_id = NEW.org_id
    LOOP
      INSERT INTO notifications (user_id, title, message, job_id, org_id)
      VALUES (
        admin_record.user_id,
        'Job Status Updated',
        COALESCE(engineer_name, 'An engineer') || ' changed ' || COALESCE(NEW.reference_number, 'a job') || ' from ' || OLD.status || ' to ' || NEW.status,
        NEW.id,
        NEW.org_id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;