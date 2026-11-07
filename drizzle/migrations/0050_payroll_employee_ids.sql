CREATE TABLE public.payroll_employee_ids (
  org_id uuid NOT NULL DEFAULT public.get_user_org_id(),
  user_id uuid NOT NULL,
  employee_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_employee_ids TO authenticated;
GRANT ALL ON public.payroll_employee_ids TO service_role;
ALTER TABLE public.payroll_employee_ids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage payroll employee ids" ON public.payroll_employee_ids FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role)
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = payroll_employee_ids.user_id AND p.org_id = payroll_employee_ids.org_id));