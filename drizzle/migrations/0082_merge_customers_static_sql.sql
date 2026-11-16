CREATE OR REPLACE FUNCTION public.merge_customers(_target_id uuid, _source_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _org uuid := public.get_user_org_id(auth.uid());
  _src uuid[]; _n bigint; _moved bigint := 0;
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

  DELETE FROM customer_sites s WHERE s.customer_id = ANY(_src)
    AND EXISTS (SELECT 1 FROM customer_sites k WHERE k.customer_id = _target_id AND k.site_id = s.site_id);
  DELETE FROM customer_sites s WHERE s.customer_id = ANY(_src) AND s.id NOT IN (
    SELECT DISTINCT ON (site_id) id FROM customer_sites WHERE customer_id = ANY(_src) ORDER BY site_id, id);

  UPDATE public.archived_documents SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.contract_agreements SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.customer_documents SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.customer_paperwork SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.customer_portal_invites SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.customer_portal_tokens SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.customer_portal_users SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.customer_sites SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.fire_log_tokens SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.handover_tokens SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.historic_reports SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.invoices SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.jobs SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.portal_visit_requests SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.price_book_items SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.renewal_reminder_log SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.service_contracts SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.site_service_schedules SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;
  UPDATE public.site_surveys SET customer_id = _target_id WHERE customer_id = ANY(_src);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved + _n;

  DELETE FROM customer_merge_suggestions WHERE existing_customer_id = ANY(_src) OR new_customer_id = ANY(_src);

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
END $function$;
REVOKE EXECUTE ON FUNCTION public.merge_customers(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_customers(uuid, uuid[]) TO authenticated;