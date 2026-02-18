
-- Function to get next PPM sequence number (used by edge function)
CREATE OR REPLACE FUNCTION public.nextval_ppm_seq()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT nextval('ppm_job_seq');
$$;
