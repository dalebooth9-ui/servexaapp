-- Allow all authenticated users to read app_settings (needed for engineers to load vehicle check items, etc.)
-- Writes remain admin-only via the existing "Admins can manage app_settings" policy.
CREATE POLICY "Authenticated can read app_settings"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (true);