
-- Sequence for contract reference numbers
CREATE SEQUENCE IF NOT EXISTS public.service_contract_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_contract_reference()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 'SC-' || LPAD(nextval('service_contract_seq')::text, 5, '0');
$$;

-- 1. service_contracts
CREATE TABLE public.service_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  reference_number text NOT NULL UNIQUE,
  name text NOT NULL,
  start_date date NOT NULL,
  renewal_date date NOT NULL,
  contract_value numeric(12,2) NOT NULL DEFAULT 0,
  billing_frequency text NOT NULL DEFAULT 'annual',
  price_increase_pct numeric(5,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_contracts TO authenticated;
GRANT ALL ON public.service_contracts TO service_role;

ALTER TABLE public.service_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage service_contracts in org"
  ON public.service_contracts FOR ALL
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Engineers view service_contracts in org"
  ON public.service_contracts FOR SELECT
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'engineer'::app_role));

CREATE INDEX service_contracts_org_customer_idx ON public.service_contracts(org_id, customer_id);
CREATE INDEX service_contracts_renewal_date_idx ON public.service_contracts(renewal_date);

CREATE TRIGGER trg_service_contracts_updated_at
  BEFORE UPDATE ON public.service_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_service_contracts_force_org
  BEFORE INSERT ON public.service_contracts
  FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();

CREATE OR REPLACE FUNCTION public.assign_service_contract_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.reference_number IS NULL OR NEW.reference_number = '' THEN
    NEW.reference_number := public.generate_contract_reference();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_service_contracts_reference
  BEFORE INSERT ON public.service_contracts
  FOR EACH ROW EXECUTE FUNCTION public.assign_service_contract_reference();

CREATE OR REPLACE FUNCTION public.validate_service_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.billing_frequency NOT IN ('annual', 'quarterly', 'monthly') THEN
    RAISE EXCEPTION 'Invalid billing frequency: %', NEW.billing_frequency;
  END IF;
  IF NEW.status NOT IN ('active', 'lapsed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid contract status: %', NEW.status;
  END IF;
  IF NEW.price_increase_pct < 0 OR NEW.price_increase_pct > 100 THEN
    RAISE EXCEPTION 'Price increase must be between 0 and 100';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_service_contracts_validate
  BEFORE INSERT OR UPDATE ON public.service_contracts
  FOR EACH ROW EXECUTE FUNCTION public.validate_service_contract();

-- 2. service_contract_sites
CREATE TABLE public.service_contract_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  contract_id uuid NOT NULL REFERENCES public.service_contracts(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, site_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_contract_sites TO authenticated;
GRANT ALL ON public.service_contract_sites TO service_role;

ALTER TABLE public.service_contract_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage service_contract_sites in org"
  ON public.service_contract_sites FOR ALL
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Engineers view service_contract_sites in org"
  ON public.service_contract_sites FOR SELECT
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'engineer'::app_role));

CREATE INDEX service_contract_sites_contract_idx ON public.service_contract_sites(contract_id);

CREATE TRIGGER trg_service_contract_sites_force_org
  BEFORE INSERT ON public.service_contract_sites
  FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();

-- 3. service_contract_services (line items)
CREATE TABLE public.service_contract_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  contract_id uuid NOT NULL REFERENCES public.service_contracts(id) ON DELETE CASCADE,
  ppm_schedule_id uuid REFERENCES public.ppm_schedules(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_contract_services TO authenticated;
GRANT ALL ON public.service_contract_services TO service_role;

ALTER TABLE public.service_contract_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage service_contract_services in org"
  ON public.service_contract_services FOR ALL
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Engineers view service_contract_services in org"
  ON public.service_contract_services FOR SELECT
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'engineer'::app_role));

CREATE INDEX service_contract_services_contract_idx ON public.service_contract_services(contract_id);

CREATE TRIGGER trg_service_contract_services_force_org
  BEFORE INSERT ON public.service_contract_services
  FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();

-- 4. service_contract_renewals (audit trail)
CREATE TABLE public.service_contract_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  contract_id uuid NOT NULL REFERENCES public.service_contracts(id) ON DELETE CASCADE,
  previous_renewal_date date NOT NULL,
  new_renewal_date date NOT NULL,
  previous_value numeric(12,2) NOT NULL,
  new_value numeric(12,2) NOT NULL,
  applied_increase_pct numeric(5,2) NOT NULL DEFAULT 0,
  notes text,
  renewed_by uuid,
  renewed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_contract_renewals TO authenticated;
GRANT ALL ON public.service_contract_renewals TO service_role;

ALTER TABLE public.service_contract_renewals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage service_contract_renewals in org"
  ON public.service_contract_renewals FOR ALL
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Engineers view service_contract_renewals in org"
  ON public.service_contract_renewals FOR SELECT
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'engineer'::app_role));

CREATE INDEX service_contract_renewals_contract_idx ON public.service_contract_renewals(contract_id);

CREATE TRIGGER trg_service_contract_renewals_force_org
  BEFORE INSERT ON public.service_contract_renewals
  FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();

-- 5. Attribution columns on jobs & invoices (nullable, no behaviour change)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.service_contracts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS invoices_contract_id_idx ON public.invoices(contract_id);

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.service_contracts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS jobs_contract_id_idx ON public.jobs(contract_id);
