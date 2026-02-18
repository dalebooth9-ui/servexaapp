
-- Notifications table for admin alerts
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Trigger function: notify all admins on job status change
CREATE OR REPLACE FUNCTION public.notify_admins_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_record RECORD;
  engineer_name text;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Get engineer name if available
    SELECT p.full_name INTO engineer_name
    FROM profiles p
    WHERE p.user_id = auth.uid();

    -- Insert notification for each admin
    FOR admin_record IN
      SELECT user_id FROM user_roles WHERE role = 'admin'
    LOOP
      INSERT INTO notifications (user_id, title, message, job_id)
      VALUES (
        admin_record.user_id,
        'Job Status Updated',
        COALESCE(engineer_name, 'An engineer') || ' changed ' || NEW.reference_number || ' from ' || OLD.status || ' to ' || NEW.status,
        NEW.id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_admins_on_status_change
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_on_status_change();
