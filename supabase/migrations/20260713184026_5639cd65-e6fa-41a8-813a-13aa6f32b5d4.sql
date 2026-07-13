REVOKE ALL ON FUNCTION public.purge_old_rejected_email_po_jobs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_rejected_email_po_jobs() TO service_role;