
ALTER TABLE public.vehicle_checks
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.vehicle_checks
  DROP CONSTRAINT IF EXISTS vehicle_checks_engineer_id_check_date_key;

CREATE OR REPLACE FUNCTION public.validate_vehicle_check_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('pending','accepted','rejected') THEN
    RAISE EXCEPTION 'Invalid vehicle check status: %', NEW.status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_vehicle_check_status_trg ON public.vehicle_checks;
CREATE TRIGGER validate_vehicle_check_status_trg
BEFORE INSERT OR UPDATE ON public.vehicle_checks
FOR EACH ROW EXECUTE FUNCTION public.validate_vehicle_check_status();

CREATE OR REPLACE FUNCTION public.notify_engineer_vehicle_check_rejected()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'rejected' THEN
    INSERT INTO notifications (user_id, title, message)
    VALUES (
      NEW.engineer_id,
      'Vehicle check rejected',
      'Your vehicle check was rejected' ||
        CASE WHEN NEW.rejection_reason IS NOT NULL THEN ': ' || NEW.rejection_reason ELSE '. Please resubmit.' END
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_engineer_vehicle_check_rejected_trg ON public.vehicle_checks;
CREATE TRIGGER notify_engineer_vehicle_check_rejected_trg
AFTER UPDATE ON public.vehicle_checks
FOR EACH ROW EXECUTE FUNCTION public.notify_engineer_vehicle_check_rejected();
