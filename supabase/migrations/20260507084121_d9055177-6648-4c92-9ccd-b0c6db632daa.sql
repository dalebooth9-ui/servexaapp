
-- Vehicle daily check sheet
CREATE TABLE public.vehicle_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engineer_id uuid NOT NULL,
  check_date date NOT NULL DEFAULT CURRENT_DATE,
  vehicle_reg text,
  mileage integer,
  items jsonb NOT NULL DEFAULT '{}'::jsonb,
  has_defects boolean NOT NULL DEFAULT false,
  defect_notes text,
  defect_photo_urls text[] DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engineer_id, check_date)
);

ALTER TABLE public.vehicle_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Engineers can view their own vehicle checks"
  ON public.vehicle_checks FOR SELECT
  USING (auth.uid() = engineer_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Engineers can insert their own vehicle checks"
  ON public.vehicle_checks FOR INSERT
  WITH CHECK (auth.uid() = engineer_id);

CREATE POLICY "Admins can manage vehicle checks"
  ON public.vehicle_checks FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Storage bucket for defect photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-checks', 'vehicle-checks', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Engineers can upload their own vehicle check photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'vehicle-checks'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Engineers can view their own vehicle check photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'vehicle-checks'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
  );

-- Notify admins when defects are reported
CREATE OR REPLACE FUNCTION public.notify_admins_vehicle_defect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_record RECORD;
  engineer_name text;
BEGIN
  IF NEW.has_defects = true THEN
    SELECT full_name INTO engineer_name FROM profiles WHERE user_id = NEW.engineer_id;
    FOR admin_record IN SELECT user_id FROM user_roles WHERE role = 'admin' LOOP
      INSERT INTO notifications (user_id, title, message)
      VALUES (
        admin_record.user_id,
        'Vehicle defect reported',
        COALESCE(engineer_name, 'An engineer') || ' reported vehicle defects on today''s check' ||
          CASE WHEN NEW.vehicle_reg IS NOT NULL THEN ' (' || NEW.vehicle_reg || ')' ELSE '' END
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_admins_vehicle_defect
  AFTER INSERT ON public.vehicle_checks
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_vehicle_defect();
