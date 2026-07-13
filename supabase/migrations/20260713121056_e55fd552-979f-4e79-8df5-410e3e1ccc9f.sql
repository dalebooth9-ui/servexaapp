-- Allow engineers to delete their OWN draft job sheet responses within their org.
-- Submitted responses remain admin-only to void/archive (out of scope for this policy).

DROP POLICY IF EXISTS "Engineers can delete own drafts" ON public.job_sheet_responses;
CREATE POLICY "Engineers can delete own drafts"
  ON public.job_sheet_responses
  FOR DELETE
  TO authenticated
  USING (
    status = 'draft'
    AND submitted_by = auth.uid()
    AND org_id = public.get_user_org_id()
  );
