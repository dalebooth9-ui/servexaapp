CREATE POLICY "Members can read their own organisation"
ON public.organisations
FOR SELECT
TO authenticated
USING (id = public.get_user_org_id());