
-- job_messages: add assignment check to WITH CHECK on engineer UPDATE
DROP POLICY IF EXISTS job_messages_engineer_update_v3 ON public.job_messages;
CREATE POLICY job_messages_engineer_update_v3 ON public.job_messages
FOR UPDATE
USING (
  (sender_id = auth.uid())
  AND has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.job_assignments ja
    WHERE ja.job_id = job_messages.job_id AND ja.engineer_id = auth.uid()
  )
)
WITH CHECK (
  (sender_id = auth.uid())
  AND has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.job_assignments ja
    WHERE ja.job_id = job_messages.job_id AND ja.engineer_id = auth.uid()
  )
);

-- job_parts: re-verify assignment + org membership on UPDATE
DROP POLICY IF EXISTS "Engineers can update own parts" ON public.job_parts;
CREATE POLICY "Engineers can update own parts" ON public.job_parts
FOR UPDATE
USING (added_by = auth.uid())
WITH CHECK (
  added_by = auth.uid()
  AND org_id = get_user_org_id()
  AND (
    EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = job_parts.job_id AND ja.engineer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.job_schedule js WHERE js.job_id = job_parts.job_id AND js.engineer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.job_visits jv WHERE jv.job_id = job_parts.job_id AND jv.engineer_id = auth.uid())
  )
);

-- job_sheet_responses: re-verify assignment on UPDATE
DROP POLICY IF EXISTS "Engineers can update own responses" ON public.job_sheet_responses;
CREATE POLICY "Engineers can update own responses" ON public.job_sheet_responses
FOR UPDATE
USING (submitted_by = auth.uid())
WITH CHECK (
  submitted_by = auth.uid()
  AND org_id = get_user_org_id()
  AND EXISTS (
    SELECT 1 FROM public.job_assignments ja
    WHERE ja.job_id = job_sheet_responses.job_id AND ja.engineer_id = auth.uid()
  )
);
