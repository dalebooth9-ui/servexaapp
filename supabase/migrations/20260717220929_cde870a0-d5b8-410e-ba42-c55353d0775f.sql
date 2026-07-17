DROP POLICY IF EXISTS "Engineers can delete own location, admins can delete within org" ON public.engineer_locations;
CREATE POLICY "Engineers can delete own location, admins can delete within org"
ON public.engineer_locations FOR DELETE
USING (
  auth.uid() = user_id
  OR (org_id IS NOT NULL AND org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
);