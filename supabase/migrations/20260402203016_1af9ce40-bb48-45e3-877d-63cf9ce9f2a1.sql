
DROP POLICY "Authenticated users can insert defects" ON public.defects;
CREATE POLICY "Authenticated users can insert own defects"
  ON public.defects FOR INSERT TO authenticated
  WITH CHECK (reported_by = auth.uid());
