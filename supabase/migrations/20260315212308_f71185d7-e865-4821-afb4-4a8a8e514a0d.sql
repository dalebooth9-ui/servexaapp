
-- Drop the existing overly-broad admin policy on xero_connections
DROP POLICY IF EXISTS "Admins can manage xero_connections" ON public.xero_connections;

-- Users can only access their own Xero connection
CREATE POLICY "Users can manage their own xero_connections"
ON public.xero_connections
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Admins can only manage Xero connections belonging to users within their own organisation
CREATE POLICY "Admins can manage xero_connections within their org"
ON public.xero_connections
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.organisation_members om_admin
    JOIN public.organisation_members om_target
      ON om_admin.org_id = om_target.org_id
    WHERE om_admin.user_id = auth.uid()
      AND om_admin.role IN ('owner', 'admin')
      AND om_admin.status = 'active'
      AND om_target.user_id = xero_connections.user_id
      AND om_target.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organisation_members om_admin
    JOIN public.organisation_members om_target
      ON om_admin.org_id = om_target.org_id
    WHERE om_admin.user_id = auth.uid()
      AND om_admin.role IN ('owner', 'admin')
      AND om_admin.status = 'active'
      AND om_target.user_id = xero_connections.user_id
      AND om_target.status = 'active'
  )
);
