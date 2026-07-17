
CREATE TABLE public.intake_misdrop_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('po_import','scan_paper_report')),
  detected_kind TEXT NOT NULL CHECK (detected_kind IN ('purchase_order','job_sheet','unknown')),
  action TEXT NOT NULL CHECK (action IN ('redirected','continued','dismissed')),
  file_name TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.intake_misdrop_log TO authenticated;
GRANT ALL ON public.intake_misdrop_log TO service_role;

ALTER TABLE public.intake_misdrop_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can insert misdrop log"
ON public.intake_misdrop_log FOR INSERT TO authenticated
WITH CHECK (org_id = public.get_user_org_id() AND user_id = auth.uid());

CREATE POLICY "Org admins can view misdrop log"
ON public.intake_misdrop_log FOR SELECT TO authenticated
USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE INDEX idx_intake_misdrop_org_created ON public.intake_misdrop_log(org_id, created_at DESC);
