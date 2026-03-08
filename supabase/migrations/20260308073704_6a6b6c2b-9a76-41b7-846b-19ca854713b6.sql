
CREATE TABLE public.planner_adhoc_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engineer_id uuid NOT NULL,
  schedule_date date NOT NULL,
  company_name text NOT NULL DEFAULT '',
  description text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.planner_adhoc_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage adhoc entries"
  ON public.planner_adhoc_entries
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view own adhoc entries"
  ON public.planner_adhoc_entries
  FOR SELECT
  TO authenticated
  USING (engineer_id = auth.uid());
