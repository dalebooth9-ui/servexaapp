CREATE OR REPLACE FUNCTION public.delete_empty_customers(_customer_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid := public.get_user_org_id(auth.uid());
  _id uuid; _r record; _n bigint; _busy boolean;
  _deleted uuid[] := '{}'; _kept jsonb := '[]'::jsonb; _why text;
BEGIN
  IF _org IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin can delete customers';
  END IF;
  FOREACH _id IN ARRAY coalesce(_customer_ids, '{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM customers WHERE id = _id AND org_id = _org) THEN CONTINUE; END IF;
    _busy := false; _why := NULL;
    FOR _r IN SELECT c.table_name FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public' AND c.column_name = 'customer_id' AND c.data_type = 'uuid'
    LOOP
      EXECUTE format('SELECT count(*) FROM public.%I WHERE customer_id = $1', _r.table_name) INTO _n USING _id;
      IF _n > 0 THEN _busy := true; _why := _r.table_name; EXIT; END IF;
    END LOOP;
    IF _busy THEN
      _kept := _kept || jsonb_build_object('id', _id, 'reason', _why);
    ELSE
      DELETE FROM customer_merge_suggestions WHERE existing_customer_id = _id OR new_customer_id = _id;
      DELETE FROM customers WHERE id = _id AND org_id = _org;
      _deleted := _deleted || _id;
    END IF;
  END LOOP;
  IF array_length(_deleted, 1) > 0 THEN
    INSERT INTO audit_logs (user_id, org_id, action, resource_id)
    VALUES (auth.uid(), _org, 'customers_bulk_deleted', NULL);
  END IF;
  RETURN jsonb_build_object('deleted', to_jsonb(_deleted), 'kept', _kept);
END $$;

CREATE OR REPLACE FUNCTION public.merge_customers(_target_id uuid, _source_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid := public.get_user_org_id(auth.uid());
  _src uuid[]; _r record; _n bigint; _moved bigint := 0;
BEGIN
  IF _org IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin can merge customers';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = _target_id AND org_id = _org) THEN
    RAISE EXCEPTION 'Customer to keep not found in your company';
  END IF;
  SELECT array_agg(id) INTO _src FROM customers
   WHERE id = ANY(coalesce(_source_ids,'{}')) AND id <> _target_id AND org_id = _org;
  IF _src IS NULL THEN RAISE EXCEPTION 'No customers to merge'; END IF;
  IF array_length(_src,1) <> (SELECT count(DISTINCT x) FROM unnest(_source_ids) x WHERE x <> _target_id) THEN
    RAISE EXCEPTION 'Some customers belong to another company';
  END IF;

  -- site links: drop ones the kept customer already has
  DELETE FROM customer_sites s WHERE s.customer_id = ANY(_src)
    AND EXISTS (SELECT 1 FROM customer_sites k WHERE k.customer_id = _target_id AND k.site_id = s.site_id);
  DELETE FROM customer_sites s WHERE s.customer_id = ANY(_src) AND s.id NOT IN (
    SELECT DISTINCT ON (site_id) id FROM customer_sites WHERE customer_id = ANY(_src) ORDER BY site_id, id);

  FOR _r IN SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'customer_id' AND c.data_type = 'uuid'
  LOOP
    EXECUTE format('UPDATE public.%I SET customer_id = $1 WHERE customer_id = ANY($2)', _r.table_name) USING _target_id, _src;
    GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  END LOOP;
  DELETE FROM customer_merge_suggestions WHERE existing_customer_id = ANY(_src) OR new_customer_id = ANY(_src);

  -- fill blanks on the kept customer from the duplicates
  UPDATE customers t SET
    email = coalesce(nullif(t.email,''), (SELECT email FROM customers WHERE id = ANY(_src) AND coalesce(email,'') <> '' LIMIT 1)),
    phone = coalesce(nullif(t.phone,''), (SELECT phone FROM customers WHERE id = ANY(_src) AND coalesce(phone,'') <> '' LIMIT 1)),
    address = coalesce(nullif(t.address,''), (SELECT address FROM customers WHERE id = ANY(_src) AND coalesce(address,'') <> '' LIMIT 1)),
    logo_url = coalesce(t.logo_url, (SELECT logo_url FROM customers WHERE id = ANY(_src) AND logo_url IS NOT NULL LIMIT 1)),
    xero_contact_id = coalesce(t.xero_contact_id, (SELECT xero_contact_id FROM customers WHERE id = ANY(_src) AND xero_contact_id IS NOT NULL LIMIT 1)),
    updated_at = now()
  WHERE t.id = _target_id;

  DELETE FROM customers WHERE id = ANY(_src) AND org_id = _org;
  INSERT INTO audit_logs (user_id, org_id, action, resource_id)
  VALUES (auth.uid(), _org, 'customers_merged', _target_id);
  RETURN jsonb_build_object('merged', array_length(_src,1), 'records_moved', _moved);
END $$;

REVOKE ALL ON FUNCTION public.delete_empty_customers(uuid[]) FROM public, anon;
REVOKE ALL ON FUNCTION public.merge_customers(uuid, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_empty_customers(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_customers(uuid, uuid[]) TO authenticated;