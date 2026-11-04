CREATE OR REPLACE FUNCTION public.mark_assets_label_printed(_asset_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin') THEN RAISE EXCEPTION 'Office only'; END IF;
  UPDATE public.assets
     SET label_status = CASE WHEN label_status = 'placed' THEN label_status ELSE 'printed' END,
         label_printed_at = now(), updated_at = now()
   WHERE id = ANY(_asset_ids) AND org_id = public.get_user_org_id();
END $function$;