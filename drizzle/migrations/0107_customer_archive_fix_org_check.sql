CREATE OR REPLACE FUNCTION public.set_customer_archived(_customer_id uuid, _archive boolean)
RETURNS public.customers LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.customers;
BEGIN
  SELECT * INTO c FROM public.customers WHERE id = _customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;
  IF auth.uid() IS NULL OR NOT (public.is_org_admin(c.org_id)
     OR (public.has_role(auth.uid(), 'admin') AND c.org_id = public.get_user_org_id())) THEN
    RAISE EXCEPTION 'Only admins can archive or restore customers';
  END IF;
  PERFORM set_config('servexa.customer_archive', 'on', true);
  UPDATE public.customers
     SET archived_at = CASE WHEN _archive THEN now() ELSE NULL END,
         archived_by = CASE WHEN _archive THEN auth.uid() ELSE NULL END
   WHERE id = _customer_id RETURNING * INTO c;
  PERFORM set_config('servexa.customer_archive', 'off', true);
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.set_customer_archived(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_customer_archived(uuid, boolean) TO authenticated;