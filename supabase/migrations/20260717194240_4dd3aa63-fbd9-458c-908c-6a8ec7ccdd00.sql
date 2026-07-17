
CREATE OR REPLACE FUNCTION public.customer_logo_path_belongs_to_caller(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id::text = split_part(_name, '/', 1)
      AND public.has_role_in_org(auth.uid(), c.org_id, 'admin'::app_role)
  );
$$;

DROP POLICY IF EXISTS "Engineers can delete own location, admins can delete within org" ON public.engineer_locations;
CREATE POLICY "Engineers can delete own location, admins can delete within org"
ON public.engineer_locations
FOR DELETE
USING (
  auth.uid() = user_id
  OR (org_id IS NOT NULL AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
);
