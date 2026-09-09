
REVOKE EXECUTE ON FUNCTION public.attach_defects_to_quote(uuid[], uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.attach_defects_to_quote(uuid[], uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_defects_on_quote_approval() FROM anon, public, authenticated;
