
-- 1) Move stripe billing identifiers into a service-role-only table
CREATE TABLE IF NOT EXISTS public.organisation_billing (
  org_id uuid PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.organisation_billing TO service_role;
ALTER TABLE public.organisation_billing ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated/anon => no client access. service_role bypasses RLS.

CREATE TRIGGER organisation_billing_updated_at
  BEFORE UPDATE ON public.organisation_billing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill existing billing data
INSERT INTO public.organisation_billing (org_id, stripe_customer_id, stripe_subscription_id)
SELECT id, stripe_customer_id, stripe_subscription_id
FROM public.organisations
WHERE stripe_customer_id IS NOT NULL OR stripe_subscription_id IS NOT NULL
ON CONFLICT (org_id) DO NOTHING;

-- Drop the exposed columns from organisations
ALTER TABLE public.organisations DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE public.organisations DROP COLUMN IF EXISTS stripe_subscription_id;

-- 2) Restrict organisation_members bootstrap to the platform admin who created the org
ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Backfill created_by for the single existing org: assign to first admin
UPDATE public.organisations o
SET created_by = (
  SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin' ORDER BY ur.user_id LIMIT 1
)
WHERE o.created_by IS NULL;

-- Auto-set created_by on insert
CREATE OR REPLACE FUNCTION public.set_org_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_org_created_by_trigger ON public.organisations;
CREATE TRIGGER set_org_created_by_trigger
  BEFORE INSERT ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.set_org_created_by();

DROP POLICY IF EXISTS "Users can bootstrap own org as owner" ON public.organisation_members;
CREATE POLICY "Org creator can bootstrap owner"
  ON public.organisation_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = organisation_members.org_id
        AND o.created_by = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.organisation_members m
      WHERE m.org_id = organisation_members.org_id
        AND m.status = 'active'
    )
  );

-- 3) Lock down realtime.messages: revoke broad access, restrict to service_role only.
-- The app uses postgres_changes exclusively (which respects underlying table RLS), not
-- broadcast/presence, so no authenticated client needs access to realtime.messages.
DROP POLICY IF EXISTS "Authenticated can read realtime messages" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can write realtime messages" ON realtime.messages;
