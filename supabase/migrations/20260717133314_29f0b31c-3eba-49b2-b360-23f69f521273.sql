
-- 1) asset-documents: drop redundant unscoped INSERT policy (Org members upload asset-documents already enforces org path)
DROP POLICY IF EXISTS "Authenticated users can upload compliance docs" ON storage.objects;

-- 2) site-survey-media: require org path match for admin access; owner path unchanged
DROP POLICY IF EXISTS "Admins or owner read site-survey-media" ON storage.objects;
DROP POLICY IF EXISTS "Admins or owner update site-survey-media" ON storage.objects;
DROP POLICY IF EXISTS "Admins or owner delete site-survey-media" ON storage.objects;

CREATE POLICY "Admins or owner read site-survey-media"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'site-survey-media' AND (
    owner = auth.uid()
    OR (
      (storage.foldername(name))[1] = (get_user_org_id())::text
      AND has_role_in_org(auth.uid(), get_user_org_id(), 'admin'::app_role)
    )
  )
);

CREATE POLICY "Admins or owner update site-survey-media"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'site-survey-media' AND (
    owner = auth.uid()
    OR (
      (storage.foldername(name))[1] = (get_user_org_id())::text
      AND has_role_in_org(auth.uid(), get_user_org_id(), 'admin'::app_role)
    )
  )
);

CREATE POLICY "Admins or owner delete site-survey-media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'site-survey-media' AND (
    owner = auth.uid()
    OR (
      (storage.foldername(name))[1] = (get_user_org_id())::text
      AND has_role_in_org(auth.uid(), get_user_org_id(), 'admin'::app_role)
    )
  )
);

-- 3) support_ticket_replies: use has_role_in_org against the ticket's org, not bare has_role
DROP POLICY IF EXISTS "Org admins read replies on org tickets" ON public.support_ticket_replies;
DROP POLICY IF EXISTS "Org admins reply on org tickets" ON public.support_ticket_replies;

CREATE POLICY "Org admins read replies on org tickets"
ON public.support_ticket_replies FOR SELECT
USING (
  NOT is_internal_note
  AND EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = support_ticket_replies.ticket_id
      AND has_role_in_org(auth.uid(), t.org_id, 'admin'::app_role)
  )
);

CREATE POLICY "Org admins reply on org tickets"
ON public.support_ticket_replies FOR INSERT
WITH CHECK (
  author_user_id = auth.uid()
  AND NOT is_internal_note
  AND author_kind = 'org_admin'
  AND EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = support_ticket_replies.ticket_id
      AND has_role_in_org(auth.uid(), t.org_id, 'admin'::app_role)
  )
);

-- 4) vehicle-checks upload: require uploader be an active member of some org (defence in depth)
DROP POLICY IF EXISTS "Engineers can upload their own vehicle check photos" ON storage.objects;

CREATE POLICY "Engineers can upload their own vehicle check photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'vehicle-checks'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.user_id = auth.uid() AND om.status = 'active'
  )
);
