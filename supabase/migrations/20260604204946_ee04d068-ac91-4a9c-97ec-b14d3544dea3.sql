-- Add org_id column to engineer_onboarding_logs for org-scoped admin-only access
ALTER TABLE public.engineer_onboarding_logs ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organisations(id);

-- Backfill org_id from organisation_members based on engineer_user_id
UPDATE public.engineer_onboarding_logs eol
SET org_id = om.org_id
FROM public.organisation_members om
WHERE om.user_id = eol.engineer_user_id
  AND om.status = 'active'
  AND eol.org_id IS NULL;

-- Drop existing SELECT policies on engineer_onboarding_logs
DROP POLICY IF EXISTS "Admins can view onboarding logs within their org" ON public.engineer_onboarding_logs;

-- Create admin-only SELECT policy scoped by org_id
CREATE POLICY "Admin-only SELECT for onboarding logs"
ON public.engineer_onboarding_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organisation_members om
    WHERE om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND om.status = 'active'
      AND om.org_id = engineer_onboarding_logs.org_id
  )
);

-- Add table comment documenting intentional admin-only access
COMMENT ON TABLE public.engineer_onboarding_logs IS 'Intentionally admin-only — engineers should not see onboarding logs';