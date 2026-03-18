
-- Drop the existing admin policy that relies on has_role (which requires org membership)
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

-- Create a security definer function to check if a user is an admin directly from user_roles
CREATE OR REPLACE FUNCTION public.is_admin_direct(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'
  );
$$;

-- Recreate the admin policy using the direct check (no org membership required)
CREATE POLICY "Admins can manage all roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.is_admin_direct(auth.uid()))
  WITH CHECK (public.is_admin_direct(auth.uid()));
