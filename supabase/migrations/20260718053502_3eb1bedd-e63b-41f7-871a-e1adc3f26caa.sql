
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS portal_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.job_documents
  ADD COLUMN IF NOT EXISTS shareable_with_customer boolean NOT NULL DEFAULT false;
ALTER TABLE public.customer_paperwork
  ADD COLUMN IF NOT EXISTS shareable_with_customer boolean NOT NULL DEFAULT true;
ALTER TABLE public.rams_documents
  ADD COLUMN IF NOT EXISTS shareable_with_customer boolean NOT NULL DEFAULT false;
ALTER TABLE public.historic_reports
  ADD COLUMN IF NOT EXISTS shareable_with_customer boolean NOT NULL DEFAULT false;

UPDATE public.job_documents
  SET shareable_with_customer = true
  WHERE document_type IN ('report','certificate','coc','customer_report','job_sheet_pdf');

CREATE TABLE IF NOT EXISTS public.customer_portal_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id        uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  email         text NOT NULL,
  invited_by    uuid REFERENCES auth.users(id),
  invited_at    timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_cpu_customer ON public.customer_portal_users(customer_id);
CREATE INDEX IF NOT EXISTS idx_cpu_org ON public.customer_portal_users(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_portal_users TO authenticated;
GRANT ALL ON public.customer_portal_users TO service_role;
ALTER TABLE public.customer_portal_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.customer_portal_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  customer_id  uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  email        text NOT NULL,
  token        text NOT NULL UNIQUE,
  invited_by   uuid REFERENCES auth.users(id),
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cpi_email ON public.customer_portal_invites(email);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_portal_invites TO authenticated;
GRANT ALL ON public.customer_portal_invites TO service_role;
ALTER TABLE public.customer_portal_invites ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.portal_visit_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  customer_id    uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  site_id        uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  requested_by   uuid NOT NULL REFERENCES auth.users(id),
  preferred_date date,
  notes          text,
  status         text NOT NULL DEFAULT 'new' CHECK (status IN ('new','triaged','scheduled','dismissed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pvr_org ON public.portal_visit_requests(org_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_visit_requests TO authenticated;
GRANT ALL ON public.portal_visit_requests TO service_role;
ALTER TABLE public.portal_visit_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_customer_user(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'customer_user')
$$;

CREATE OR REPLACE FUNCTION public.customer_user_customer_id(_uid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT customer_id FROM public.customer_portal_users WHERE user_id = _uid AND is_active = true LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.customer_user_org_id(_uid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.customer_portal_users WHERE user_id = _uid AND is_active = true LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.customer_user_can_see_site(_uid uuid, _site_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customer_sites cs
    JOIN public.customer_portal_users cpu
      ON cpu.customer_id = cs.customer_id
     AND cpu.org_id = cs.org_id
     AND cpu.is_active = true
    WHERE cpu.user_id = _uid AND cs.site_id = _site_id
  )
$$;

CREATE OR REPLACE FUNCTION public.customer_user_can_see_job(_uid uuid, _job_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jobs j
    JOIN public.customer_portal_users cpu
      ON cpu.customer_id = j.customer_id
     AND cpu.org_id = j.org_id
     AND cpu.is_active = true
    WHERE cpu.user_id = _uid
      AND j.id = _job_id
      AND j.status IN ('completed','invoiced','signed_off','closed')
  )
$$;

CREATE OR REPLACE FUNCTION public.customer_user_portal_enabled(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(o.portal_enabled, false)
  FROM public.customer_portal_users cpu
  JOIN public.organisations o ON o.id = cpu.org_id
  WHERE cpu.user_id = _uid AND cpu.is_active = true LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.is_customer_user(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.customer_user_customer_id(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.customer_user_org_id(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.customer_user_can_see_site(uuid,uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.customer_user_can_see_job(uuid,uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.customer_user_portal_enabled(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_customer_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_user_customer_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_user_org_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_user_can_see_site(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_user_can_see_job(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_user_portal_enabled(uuid) TO authenticated;

-- Portal-table policies (note: has_role_in_org signature is (uid, org_id, role))
CREATE POLICY "Portal user reads own row"
  ON public.customer_portal_users FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Org admins manage portal users"
  ON public.customer_portal_users FOR ALL TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Org admins manage portal invites"
  ON public.customer_portal_invites FOR ALL TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Admins read visit requests"
  ON public.portal_visit_requests FOR SELECT TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Admins update visit requests"
  ON public.portal_visit_requests FOR UPDATE TO authenticated
  USING (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Portal users read own visit requests"
  ON public.portal_visit_requests FOR SELECT TO authenticated
  USING (
    customer_id = public.customer_user_customer_id(auth.uid())
    AND org_id = public.customer_user_org_id(auth.uid())
  );

CREATE POLICY "Portal users insert own visit requests"
  ON public.portal_visit_requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND customer_id = public.customer_user_customer_id(auth.uid())
    AND org_id = public.customer_user_org_id(auth.uid())
  );

-- Data table policies
CREATE POLICY "Customer user reads own customer"
  ON public.customers FOR SELECT TO authenticated
  USING (id = public.customer_user_customer_id(auth.uid()));

CREATE POLICY "Customer user reads own sites"
  ON public.sites FOR SELECT TO authenticated
  USING (public.customer_user_can_see_site(auth.uid(), id));

CREATE POLICY "Customer user reads own customer_sites"
  ON public.customer_sites FOR SELECT TO authenticated
  USING (
    customer_id = public.customer_user_customer_id(auth.uid())
    AND org_id = public.customer_user_org_id(auth.uid())
  );

CREATE POLICY "Customer user reads own completed jobs"
  ON public.jobs FOR SELECT TO authenticated
  USING (
    customer_id = public.customer_user_customer_id(auth.uid())
    AND org_id = public.customer_user_org_id(auth.uid())
    AND status IN ('completed','invoiced','signed_off','closed')
  );

CREATE POLICY "Customer user reads shareable job docs"
  ON public.job_documents FOR SELECT TO authenticated
  USING (
    shareable_with_customer = true
    AND public.customer_user_can_see_job(auth.uid(), job_id)
  );

CREATE POLICY "Customer user reads shareable paperwork"
  ON public.customer_paperwork FOR SELECT TO authenticated
  USING (
    shareable_with_customer = true
    AND customer_id = public.customer_user_customer_id(auth.uid())
    AND org_id = public.customer_user_org_id(auth.uid())
  );

CREATE POLICY "Customer user reads shareable historic"
  ON public.historic_reports FOR SELECT TO authenticated
  USING (
    shareable_with_customer = true
    AND customer_id = public.customer_user_customer_id(auth.uid())
    AND org_id = public.customer_user_org_id(auth.uid())
  );

CREATE POLICY "Customer user reads own quotes"
  ON public.invoices FOR SELECT TO authenticated
  USING (
    document_type = 'quote'
    AND status IN ('sent','accepted','declined')
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = invoices.job_id
        AND j.customer_id = public.customer_user_customer_id(auth.uid())
    )
  );

CREATE POLICY "Customer user accepts own quote"
  ON public.invoices FOR UPDATE TO authenticated
  USING (
    document_type = 'quote'
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = invoices.job_id
        AND j.customer_id = public.customer_user_customer_id(auth.uid())
        AND j.org_id = public.customer_user_org_id(auth.uid())
    )
  )
  WITH CHECK (
    document_type = 'quote'
    AND status IN ('accepted','declined')
  );

CREATE POLICY "Customer user reads own quote lines"
  ON public.invoice_line_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices inv
      JOIN public.jobs j ON j.id = inv.job_id
      WHERE inv.id = invoice_line_items.invoice_id
        AND inv.document_type = 'quote'
        AND j.customer_id = public.customer_user_customer_id(auth.uid())
    )
  );

CREATE POLICY "Customer user reads own schedules"
  ON public.site_service_schedules FOR SELECT TO authenticated
  USING (
    customer_id = public.customer_user_customer_id(auth.uid())
    AND org_id = public.customer_user_org_id(auth.uid())
  );

CREATE POLICY "Customer user reads own org"
  ON public.organisations FOR SELECT TO authenticated
  USING (id = public.customer_user_org_id(auth.uid()));

-- Views
CREATE OR REPLACE VIEW public.customer_defect_summary
WITH (security_invoker=on) AS
SELECT d.id, d.job_id, d.site_id, d.title, d.severity, d.status,
       d.location_on_site, d.created_at
FROM public.defects d
WHERE EXISTS (
  SELECT 1 FROM public.jobs j
  WHERE j.id = d.job_id
    AND j.customer_id = public.customer_user_customer_id(auth.uid())
);
GRANT SELECT ON public.customer_defect_summary TO authenticated;

CREATE OR REPLACE VIEW public.customer_job_summary
WITH (security_invoker=on) AS
SELECT j.id, j.customer_id, j.site_id, j.status, j.reference_number,
       j.name, j.category, j.completed_at, j.created_at
FROM public.jobs j
WHERE j.customer_id = public.customer_user_customer_id(auth.uid())
  AND j.status IN ('completed','invoiced','signed_off','closed');
GRANT SELECT ON public.customer_job_summary TO authenticated;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at_portal()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_cpu_updated ON public.customer_portal_users;
CREATE TRIGGER trg_cpu_updated BEFORE UPDATE ON public.customer_portal_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_portal();

DROP TRIGGER IF EXISTS trg_pvr_updated ON public.portal_visit_requests;
CREATE TRIGGER trg_pvr_updated BEFORE UPDATE ON public.portal_visit_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_portal();
