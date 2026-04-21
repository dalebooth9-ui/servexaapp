-- Allow service_role to insert jobs (for external integrations like Zapier)
CREATE POLICY "Service role can insert jobs"
ON public.jobs
FOR INSERT
TO service_role
WITH CHECK (true);