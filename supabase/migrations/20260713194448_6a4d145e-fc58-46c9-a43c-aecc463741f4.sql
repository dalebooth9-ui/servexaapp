
-- Restrictive policy for customer-logos writes: caller must belong to the customer's org.
-- Path convention: {customer_uuid}/filename
CREATE OR REPLACE FUNCTION public.customer_logo_path_belongs_to_caller(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id::text = split_part(_name, '/', 1)
      AND c.org_id = public.get_user_org_id()
  );
$$;

CREATE POLICY "customer_logos_write_scope_insert"
  ON storage.objects
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id <> 'customer-logos'
    OR public.customer_logo_path_belongs_to_caller(name)
  );

CREATE POLICY "customer_logos_write_scope_update"
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id <> 'customer-logos'
    OR public.customer_logo_path_belongs_to_caller(name)
  )
  WITH CHECK (
    bucket_id <> 'customer-logos'
    OR public.customer_logo_path_belongs_to_caller(name)
  );

CREATE POLICY "customer_logos_write_scope_delete"
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (
    bucket_id <> 'customer-logos'
    OR public.customer_logo_path_belongs_to_caller(name)
  );

-- Restrictive policy for shared platform templates: writes limited to Viva org admins.
CREATE POLICY "templates_write_platform_only_insert"
  ON storage.objects
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id <> 'templates'
    OR public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'::app_role)
  );

CREATE POLICY "templates_write_platform_only_update"
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id <> 'templates'
    OR public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'::app_role)
  )
  WITH CHECK (
    bucket_id <> 'templates'
    OR public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'::app_role)
  );

CREATE POLICY "templates_write_platform_only_delete"
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (
    bucket_id <> 'templates'
    OR public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'::app_role)
  );
