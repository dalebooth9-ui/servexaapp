
-- Drop the overly permissive SELECT policy on defects
DROP POLICY IF EXISTS "Authenticated users can view defects" ON public.defects;

-- Admins can view defects within their org (via job or site org_id, or where no org is set)
CREATE POLICY "Admins can view org defects"
ON public.defects
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    -- Defect linked to a job in the user's org
    (job_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM jobs j WHERE j.id = defects.job_id AND (j.org_id = get_user_org_id() OR j.org_id IS NULL)
    ))
    OR
    -- Defect not linked to a job (standalone defect)
    (job_id IS NULL)
  )
);

-- Engineers can view defects they reported or that are linked to their assigned jobs
CREATE POLICY "Engineers can view relevant defects"
ON public.defects
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'engineer'::app_role)
  AND (
    reported_by = auth.uid()
    OR (job_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM job_assignments ja WHERE ja.job_id = defects.job_id AND ja.engineer_id = auth.uid()
    ))
  )
);
