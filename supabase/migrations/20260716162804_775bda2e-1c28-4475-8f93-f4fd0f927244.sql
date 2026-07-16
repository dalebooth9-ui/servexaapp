
-- 1. Extend support_tickets ------------------------------------------------
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS ticket_type text NOT NULL DEFAULT 'problem',
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS assigned_to_platform uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reply_by_kind text,
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS internal_notes_count integer NOT NULL DEFAULT 0;

-- Relax the status check to allow in_progress.
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_status_chk;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_status_chk CHECK (status IN ('open','in_progress','resolved'));

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_type_chk CHECK (ticket_type IN ('problem','question','feature','feedback'));

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_priority_chk CHECK (priority IN ('low','normal','high'));

-- 2. Platform admin can read + update all tickets --------------------------
DROP POLICY IF EXISTS "Platform admins read all tickets" ON public.support_tickets;
CREATE POLICY "Platform admins read all tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'));

DROP POLICY IF EXISTS "Platform admins update all tickets" ON public.support_tickets;
CREATE POLICY "Platform admins update all tickets"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'))
  WITH CHECK (public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'));

-- 3. Replies table ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,
  author_email text,
  author_kind text NOT NULL,
  body text NOT NULL,
  is_internal_note boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ticket_replies_kind_chk CHECK (author_kind IN ('reporter','org_admin','operator','system'))
);

GRANT SELECT, INSERT ON public.support_ticket_replies TO authenticated;
GRANT ALL ON public.support_ticket_replies TO service_role;

ALTER TABLE public.support_ticket_replies ENABLE ROW LEVEL SECURITY;

-- Reporter can read replies on their own ticket (excluding internal notes).
CREATE POLICY "Reporter reads replies on own ticket"
  ON public.support_ticket_replies FOR SELECT TO authenticated
  USING (
    NOT is_internal_note
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_replies.ticket_id
        AND t.user_id = auth.uid()
    )
  );

-- Org admins read all replies on their org's tickets (including internal notes? no — internal notes are Servexa-internal).
CREATE POLICY "Org admins read replies on org tickets"
  ON public.support_ticket_replies FOR SELECT TO authenticated
  USING (
    NOT is_internal_note
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_replies.ticket_id
        AND t.org_id = public.get_user_org_id()
        AND public.has_role(auth.uid(), 'admin')
    )
  );

-- Platform admins read everything.
CREATE POLICY "Platform admins read all replies"
  ON public.support_ticket_replies FOR SELECT TO authenticated
  USING (public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin'));

-- Reporter can reply on their own ticket.
CREATE POLICY "Reporter replies on own ticket"
  ON public.support_ticket_replies FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND NOT is_internal_note
    AND author_kind = 'reporter'
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_replies.ticket_id
        AND t.user_id = auth.uid()
    )
  );

-- Org admins reply on any ticket in their org.
CREATE POLICY "Org admins reply on org tickets"
  ON public.support_ticket_replies FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND NOT is_internal_note
    AND author_kind = 'org_admin'
    AND public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_replies.ticket_id
        AND t.org_id = public.get_user_org_id()
    )
  );

-- Platform admins reply / internal-note on any ticket.
CREATE POLICY "Platform admins reply on any ticket"
  ON public.support_ticket_replies FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND author_kind IN ('operator','system')
    AND public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin')
  );

CREATE INDEX IF NOT EXISTS support_ticket_replies_ticket_idx
  ON public.support_ticket_replies (ticket_id, created_at ASC);

-- 4. Denormalise last-reply info on ticket -------------------------------
CREATE OR REPLACE FUNCTION public.support_ticket_replies_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.support_tickets
    SET last_reply_at = NEW.created_at,
        last_reply_by_kind = NEW.author_kind,
        internal_notes_count = internal_notes_count + CASE WHEN NEW.is_internal_note THEN 1 ELSE 0 END,
        -- reopen resolved ticket if a non-operator, non-note reply arrives
        status = CASE
          WHEN NEW.is_internal_note THEN status
          WHEN status = 'resolved' AND NEW.author_kind IN ('reporter','org_admin') THEN 'open'
          ELSE status
        END,
        updated_at = now()
    WHERE id = NEW.ticket_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS support_ticket_replies_after_insert ON public.support_ticket_replies;
CREATE TRIGGER support_ticket_replies_after_insert
  AFTER INSERT ON public.support_ticket_replies
  FOR EACH ROW EXECUTE FUNCTION public.support_ticket_replies_after_insert();

-- 5. Storage policies for support-attachments ---------------------------
-- Users upload their own files under {user_id}/...
DROP POLICY IF EXISTS "Users upload own support attachments" ON storage.objects;
CREATE POLICY "Users upload own support attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users read own support attachments" ON storage.objects;
CREATE POLICY "Users read own support attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role_in_org(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'admin')
      OR public.has_role(auth.uid(), 'admin')
    )
  );

DROP POLICY IF EXISTS "Users delete own support attachments" ON storage.objects;
CREATE POLICY "Users delete own support attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE INDEX IF NOT EXISTS support_tickets_status_updated_idx
  ON public.support_tickets (status, updated_at DESC);
