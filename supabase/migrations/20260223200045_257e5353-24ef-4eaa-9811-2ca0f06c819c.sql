-- Drop the existing restrictive update policy for engineers
DROP POLICY IF EXISTS "Engineers can update own draft responses" ON public.job_sheet_responses;

-- Create a new policy allowing engineers to update any of their own responses (draft or submitted)
CREATE POLICY "Engineers can update own responses"
ON public.job_sheet_responses
FOR UPDATE
USING (submitted_by = auth.uid())
WITH CHECK (submitted_by = auth.uid());