-- Tighten admin-only tables so engineers cannot read them via direct client calls
DROP POLICY IF EXISTS "Members can read customers" ON public.customers;
CREATE POLICY "Admins can read customers" ON public.customers
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Members can read sites" ON public.sites;
CREATE POLICY "Admins can read sites" ON public.sites
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Members can read assets" ON public.assets;
CREATE POLICY "Admins can read assets" ON public.assets
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));