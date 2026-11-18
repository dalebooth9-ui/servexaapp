REVOKE EXECUTE ON FUNCTION public.confirm_job_merge(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.merge_asset_duplicates(uuid, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_job_merge(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_asset_duplicates(uuid, uuid[], text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_empty_customers(_customer_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _org uuid := public.get_user_org_id(auth.uid());
  _id uuid; _r record; _n bigint; _busy boolean;
  _deleted uuid[] := '{}'; _kept jsonb := '[]'::jsonb; _why text;
BEGIN
  IF _org IS NULL OR NOT public.has_role_in_org(auth.uid(), _org, 'admin') THEN
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
END $function$;