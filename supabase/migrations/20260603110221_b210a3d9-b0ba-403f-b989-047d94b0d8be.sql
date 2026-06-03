CREATE POLICY "Engineers can view published job sheet templates"
ON public.job_sheet_templates
FOR SELECT
TO authenticated
USING (COALESCE(status, 'published') = 'published');