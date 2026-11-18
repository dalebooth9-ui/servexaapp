CREATE TABLE public.report_comparison_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  response_id uuid NOT NULL REFERENCES public.job_sheet_responses(id) ON DELETE CASCADE,
  previous_response_id uuid,
  flag_key text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('ok','needs_fixing')),
  decided_by uuid NOT NULL DEFAULT auth.uid(),
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, flag_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_comparison_reviews TO authenticated;
GRANT ALL ON public.report_comparison_reviews TO service_role;
ALTER TABLE public.report_comparison_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Office reads comparison reviews" ON public.report_comparison_reviews FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE POLICY "Office writes comparison reviews" ON public.report_comparison_reviews FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role) AND decided_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.job_sheet_responses r WHERE r.id = response_id AND r.org_id = report_comparison_reviews.org_id));
CREATE POLICY "Office updates comparison reviews" ON public.report_comparison_reviews FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role) AND decided_by = auth.uid());
CREATE POLICY "Office deletes comparison reviews" ON public.report_comparison_reviews FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));