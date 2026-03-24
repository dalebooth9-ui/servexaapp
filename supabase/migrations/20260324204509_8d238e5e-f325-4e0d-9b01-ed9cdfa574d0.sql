
-- =====================================================
-- FIX 1: profile_names view — add security_invoker + restrict to authenticated only
-- Recreate view with security_invoker=true and a WHERE clause
-- so each user can only see their own name (admins see all)
-- =====================================================
DROP VIEW IF EXISTS public.profile_names;

CREATE VIEW public.profile_names
WITH (security_invoker = true)
AS
  SELECT user_id, full_name
  FROM public.profiles
  WHERE
    user_id = auth.uid()
    OR public.is_admin_direct(auth.uid());

-- Revoke from anon/public, grant only to authenticated
REVOKE ALL ON public.profile_names FROM anon, PUBLIC;
GRANT SELECT ON public.profile_names TO authenticated;

-- =====================================================
-- FIX 2: organisations_safe view — revoke anon access
-- (view already has security_invoker=true and masks Stripe fields for non-admins)
-- =====================================================
REVOKE ALL ON public.organisations_safe FROM anon, PUBLIC;
GRANT SELECT ON public.organisations_safe TO authenticated;

-- =====================================================
-- FIX 3: Ensure profiles table has RLS enabled with correct policies
-- (this backs the profile_names view)
-- =====================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own profile
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_direct(auth.uid()));

-- Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_direct(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin_direct(auth.uid()));

-- Users can insert their own profile (via trigger)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admins can delete profiles
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (public.is_admin_direct(auth.uid()));
