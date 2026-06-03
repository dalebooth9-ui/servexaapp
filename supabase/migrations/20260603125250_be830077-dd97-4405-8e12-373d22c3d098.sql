-- Broaden engineer access to job_parts so engineers assigned via job_schedule or job_visits
-- (not only job_assignments) can see and add materials.

DROP POLICY IF EXISTS "Engineers can view parts for assigned jobs" ON public.job_parts;
DROP POLICY IF EXISTS "Engineers can add parts to assigned jobs" ON public.job_parts;

CREATE POLICY "Engineers can view parts for assigned jobs"
ON public.job_parts
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = job_parts.job_id AND ja.engineer_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.job_schedule js WHERE js.job_id = job_parts.job_id AND js.engineer_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.job_visits jv WHERE jv.job_id = job_parts.job_id AND jv.engineer_id = auth.uid())
);

CREATE POLICY "Engineers can add parts to assigned jobs"
ON public.job_parts
FOR INSERT
WITH CHECK (
  added_by = auth.uid()
  AND (
    EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id = job_parts.job_id AND ja.engineer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.job_schedule js WHERE js.job_id = job_parts.job_id AND js.engineer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.job_visits jv WHERE jv.job_id = job_parts.job_id AND jv.engineer_id = auth.uid())
  )
);