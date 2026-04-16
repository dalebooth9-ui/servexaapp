
-- Restrict INSERT on organisations to admin users only
-- Engineers and regular users should not be able to create new organisations
DROP POLICY IF EXISTS "Authenticated users can create organisations" ON public.organisations;

-- Recreate with admin-only restriction
CREATE POLICY "Only admins can create organisations"
ON public.organisations
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
);
