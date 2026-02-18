-- Fix: Restrict xero_connections RLS to owner-only (prevent admin lateral access to other users' tokens)
DROP POLICY "Admins can manage xero connections" ON public.xero_connections;

CREATE POLICY "Users can manage own xero connections"
  ON public.xero_connections FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());