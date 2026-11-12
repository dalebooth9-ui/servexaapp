ALTER FUNCTION public.move_to_dlq(text,text,bigint,jsonb) SET search_path = '';
ALTER FUNCTION public.read_email_batch(text,integer,integer) SET search_path = '';
ALTER FUNCTION public.enqueue_email(text,jsonb) SET search_path = '';
ALTER FUNCTION public.delete_email(text,bigint) SET search_path = '';

DROP POLICY IF EXISTS "Allow authenticated uploads to marketing screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated reads with signed URLs" ON storage.objects;

CREATE POLICY "Platform admins upload marketing screenshots" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'marketing-screenshots' AND public.has_role((select auth.uid()), 'platform_admin'::public.app_role) AND owner_id = (select auth.uid()::text));

CREATE POLICY "Platform admins read marketing screenshots" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'marketing-screenshots' AND public.has_role((select auth.uid()), 'platform_admin'::public.app_role));