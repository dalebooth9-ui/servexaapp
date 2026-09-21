-- Engineers could not read the customer, site or colleague records behind the
-- jobs they are assigned to, so job-sheet prefill arrived empty on their device.
-- Scope stays tight: only records reachable through a job they are assigned to.

CREATE OR REPLACE FUNCTION public.engineer_can_access_site(_user_id uuid, _site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.job_assignments ja ON ja.job_id = j.id
    WHERE ja.engineer_id = _user_id
      AND j.site_id = _site_id
  );
$$;

CREATE OR REPLACE FUNCTION public.shares_job_assignment(_viewer uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_assignments mine
    JOIN public.job_assignments theirs ON theirs.job_id = mine.job_id
    WHERE mine.engineer_id = _viewer
      AND theirs.engineer_id = _target
  );
$$;

DROP POLICY IF EXISTS "Engineers read customers for assigned jobs" ON public.customers;
CREATE POLICY "Engineers read customers for assigned jobs"
ON public.customers FOR SELECT TO authenticated
USING (
  org_id = get_user_org_id()
  AND has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
  AND engineer_can_access_customer(auth.uid(), id)
);

DROP POLICY IF EXISTS "Engineers read sites for assigned jobs" ON public.sites;
CREATE POLICY "Engineers read sites for assigned jobs"
ON public.sites FOR SELECT TO authenticated
USING (
  org_id = get_user_org_id()
  AND has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
  AND engineer_can_access_site(auth.uid(), id)
);

DROP POLICY IF EXISTS "Engineers read profiles of job colleagues" ON public.profiles;
CREATE POLICY "Engineers read profiles of job colleagues"
ON public.profiles FOR SELECT TO authenticated
USING (
  org_id IS NOT NULL
  AND org_id = get_user_org_id()
  AND has_role_in_org(auth.uid(), org_id, 'engineer'::app_role)
  AND shares_job_assignment(auth.uid(), user_id)
);

GRANT SELECT ON public.customers TO authenticated;
GRANT SELECT ON public.sites TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
