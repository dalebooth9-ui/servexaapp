CREATE POLICY "Engineers can delete own location, admins can delete within org"
ON public.engineer_locations
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR (
    EXISTS (
      SELECT 1 FROM public.organisation_members om_admin
      WHERE om_admin.user_id = auth.uid()
        AND om_admin.role IN ('owner', 'admin')
        AND om_admin.status = 'active'
        AND EXISTS (
          SELECT 1 FROM public.organisation_members om_engineer
          WHERE om_engineer.user_id = engineer_locations.user_id
            AND om_engineer.org_id = om_admin.org_id
            AND om_engineer.status = 'active'
        )
    )
  )
);

COMMENT ON POLICY "Engineers can delete own location, admins can delete within org" 
ON public.engineer_locations IS 'GDPR right to erasure — engineers can remove their own location history';