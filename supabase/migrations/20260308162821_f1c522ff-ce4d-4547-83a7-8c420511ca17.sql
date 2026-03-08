
-- ============================================================
-- ORGANISATIONS — Multi-tenancy foundation
-- ============================================================

-- 1. Create the organisations table
CREATE TABLE public.organisations (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT        NOT NULL,
  slug          TEXT        NOT NULL UNIQUE,
  logo_url      TEXT,
  primary_color TEXT,
  plan          TEXT        NOT NULL DEFAULT 'trial',
  plan_status   TEXT        NOT NULL DEFAULT 'active',
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '14 days'),
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

-- 2. Create organisation_members table (links users to orgs with a role)
CREATE TABLE public.organisation_members (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          UUID        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL,
  role            TEXT        NOT NULL DEFAULT 'member',
  invited_by      UUID,
  invited_email   TEXT,
  status          TEXT        NOT NULL DEFAULT 'active',
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

ALTER TABLE public.organisation_members ENABLE ROW LEVEL SECURITY;

-- 3. Organisation invitations table
CREATE TABLE public.organisation_invitations (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          UUID        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  email           TEXT        NOT NULL,
  role            TEXT        NOT NULL DEFAULT 'member',
  invited_by      UUID        NOT NULL,
  token           TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at     TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.organisation_invitations ENABLE ROW LEVEL SECURITY;

-- 4. Add org_id to core tables (nullable for backward compat)
ALTER TABLE public.jobs                ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE;
ALTER TABLE public.customers           ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE;
ALTER TABLE public.sites               ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE;
ALTER TABLE public.assets              ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE;
ALTER TABLE public.invoices            ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE;
ALTER TABLE public.compliance_records  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE;
ALTER TABLE public.profiles            ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE;
ALTER TABLE public.job_sheet_templates ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE;
ALTER TABLE public.parts_library       ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE;

-- 5. Performance indexes
CREATE INDEX idx_organisation_members_org_id     ON public.organisation_members(org_id);
CREATE INDEX idx_organisation_members_user_id    ON public.organisation_members(user_id);
CREATE INDEX idx_organisation_invitations_org_id ON public.organisation_invitations(org_id);
CREATE INDEX idx_organisation_invitations_token  ON public.organisation_invitations(token);
CREATE INDEX idx_jobs_org_id        ON public.jobs(org_id);
CREATE INDEX idx_customers_org_id   ON public.customers(org_id);

-- 6. Helper: get the org_id for the current user
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.organisation_members
  WHERE user_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$;

-- 7. Helper: check if user belongs to an org
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organisation_members
    WHERE user_id = auth.uid()
      AND org_id = _org_id
      AND status = 'active'
  );
$$;

-- 8. Helper: check if user is org owner or admin
CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organisation_members
    WHERE user_id = auth.uid()
      AND org_id = _org_id
      AND role IN ('owner', 'admin')
      AND status = 'active'
  );
$$;

-- 9. RLS for organisations
CREATE POLICY "Members can view their org"
  ON public.organisations FOR SELECT
  USING (public.user_belongs_to_org(id));

CREATE POLICY "Org admins can update their org"
  ON public.organisations FOR UPDATE
  USING (public.is_org_admin(id))
  WITH CHECK (public.is_org_admin(id));

-- Allow new org creation during onboarding (insert by authenticated users)
CREATE POLICY "Authenticated users can create an org"
  ON public.organisations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 10. RLS for organisation_members
CREATE POLICY "Members can view members of own org"
  ON public.organisation_members FOR SELECT
  USING (public.user_belongs_to_org(org_id));

CREATE POLICY "Org admins can manage members"
  ON public.organisation_members FOR ALL
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- Allow users to insert themselves as owner during org creation
CREATE POLICY "Users can insert themselves as org member"
  ON public.organisation_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- 11. RLS for organisation_invitations
CREATE POLICY "Org admins can manage invitations"
  ON public.organisation_invitations FOR ALL
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "Anyone can view an invitation by token (validated in code)"
  ON public.organisation_invitations FOR SELECT
  USING (true);

-- 12. Timestamps triggers
CREATE TRIGGER update_organisations_updated_at
  BEFORE UPDATE ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organisation_members_updated_at
  BEFORE UPDATE ON public.organisation_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
