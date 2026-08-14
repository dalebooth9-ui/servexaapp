CREATE OR REPLACE FUNCTION public.purge_old_client_errors()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.client_errors WHERE created_at < now() - interval '60 days';

  DELETE FROM public.client_errors ce
  USING (
    SELECT id, row_number() OVER (PARTITION BY org_id ORDER BY created_at DESC) AS rn
    FROM public.client_errors
  ) ranked
  WHERE ce.id = ranked.id AND ranked.rn > 5000;
END;
$$;