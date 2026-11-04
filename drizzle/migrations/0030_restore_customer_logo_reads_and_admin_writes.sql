CREATE POLICY "Public read customer logos only" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'customer-logos');
CREATE OR REPLACE FUNCTION public.customer_logo_path_belongs_to_caller(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
SELECT EXISTS (SELECT 1 FROM public.customers c WHERE c.id::text = split_part(_name, '/', 1) AND c.org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), c.org_id, 'admin'::public.app_role))
OR (split_part(_name, '/', 1) = public.get_user_org_id()::text AND split_part(_name, '/', 2) = 'print-logos' AND public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin'::public.app_role));
$function$;
REVOKE ALL ON FUNCTION public.customer_logo_path_belongs_to_caller(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_logo_path_belongs_to_caller(text) TO authenticated, service_role;