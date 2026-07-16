-- 1) Make get_user_org_id deterministic (oldest active membership wins)
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT org_id
  FROM public.organisation_members
  WHERE user_id = auth.uid()
    AND status = 'active'
  ORDER BY created_at ASC, org_id ASC
  LIMIT 1;
$function$;

-- 2) Restrict management of shared/global (org_id IS NULL) job sheet templates
--    to platform admins only. Tenant admins keep full control of their own
--    org's templates.
DROP POLICY IF EXISTS "Admins manage templates in org" ON public.job_sheet_templates;

CREATE POLICY "Tenant admins manage own-org templates"
ON public.job_sheet_templates
FOR ALL
TO authenticated
USING (
  org_id IS NOT NULL
  AND org_id = get_user_org_id()
  AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role)
)
WITH CHECK (
  org_id IS NOT NULL
  AND org_id = get_user_org_id()
  AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role)
);

CREATE POLICY "Platform admins manage global templates"
ON public.job_sheet_templates
FOR ALL
TO authenticated
USING (
  org_id IS NULL
  AND has_role_in_org(
    auth.uid(),
    '11111111-1111-1111-1111-111111111111'::uuid,
    'admin'::app_role
  )
)
WITH CHECK (
  org_id IS NULL
  AND has_role_in_org(
    auth.uid(),
    '11111111-1111-1111-1111-111111111111'::uuid,
    'admin'::app_role
  )
);