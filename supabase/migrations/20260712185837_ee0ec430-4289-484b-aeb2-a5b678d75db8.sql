
-- ============================================================
-- Reliability tables: client_errors + support_tickets
-- ============================================================

-- CLIENT ERRORS ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_errors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  page_url     text,
  route        text,
  source       text NOT NULL DEFAULT 'client', -- 'client' | 'api' | 'edge' | 'boundary' | 'unhandled'
  message      text NOT NULL,
  stack        text,
  user_agent   text,
  context      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.client_errors TO authenticated;
GRANT ALL ON public.client_errors TO service_role;

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

-- Any signed-in user can log an error for their own org (or org-less at signup)
CREATE POLICY "Users can insert errors for their org"
  ON public.client_errors FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (org_id IS NULL OR org_id = public.get_user_org_id())
  );

-- Only admins can read errors, and only for their own org
CREATE POLICY "Admins read errors in their org"
  ON public.client_errors FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND org_id IS NOT NULL
    AND org_id = public.get_user_org_id()
  );

-- Admins can delete errors in their org (manual purge)
CREATE POLICY "Admins delete errors in their org"
  ON public.client_errors FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND org_id = public.get_user_org_id()
  );

CREATE INDEX IF NOT EXISTS client_errors_org_created_idx
  ON public.client_errors (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_errors_user_created_idx
  ON public.client_errors (user_id, created_at DESC);


-- SUPPORT TICKETS --------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_name  text,
  reporter_email text,
  description  text NOT NULL,
  page_url     text,
  route        text,
  user_agent   text,
  context      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'open',
  resolved_at  timestamptz,
  resolved_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_status_chk CHECK (status IN ('open','resolved'))
);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Anyone signed-in can raise a ticket for their own org
CREATE POLICY "Users insert tickets for their org"
  ON public.support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (org_id IS NULL OR org_id = public.get_user_org_id())
  );

-- Admins in the org can read all tickets
CREATE POLICY "Admins read tickets in their org"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND org_id = public.get_user_org_id()
  );

-- Reporter can read their own ticket
CREATE POLICY "Reporter reads own ticket"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can update ticket status/resolution in their org
CREATE POLICY "Admins update tickets in their org"
  ON public.support_tickets FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND org_id = public.get_user_org_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND org_id = public.get_user_org_id()
  );

CREATE INDEX IF NOT EXISTS support_tickets_org_status_idx
  ON public.support_tickets (org_id, status, created_at DESC);

CREATE TRIGGER support_tickets_set_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- PURGE FUNCTION + DAILY CRON --------------------------------
CREATE OR REPLACE FUNCTION public.purge_old_client_errors()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.client_errors WHERE created_at < now() - interval '60 days';
$$;
REVOKE ALL ON FUNCTION public.purge_old_client_errors() FROM public;
GRANT EXECUTE ON FUNCTION public.purge_old_client_errors() TO service_role;

DO $$
DECLARE v_id bigint;
BEGIN
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'purge-old-client-errors' LIMIT 1;
  IF v_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_id);
  END IF;
  PERFORM cron.schedule(
    'purge-old-client-errors',
    '30 3 * * *',
    $cron$SELECT public.purge_old_client_errors();$cron$
  );
END $$;
