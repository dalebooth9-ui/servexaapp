CREATE TABLE public.contract_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL DEFAULT get_user_org_id(),
  name TEXT NOT NULL,
  description TEXT,
  clauses JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual',
  source_file TEXT,
  is_starter BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft',
  review_note TEXT,
  approved_by UUID,
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_templates TO authenticated;
GRANT ALL ON public.contract_templates TO service_role;
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins manage contract templates"
ON public.contract_templates FOR ALL TO authenticated
USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Org members view contract templates"
ON public.contract_templates FOR SELECT TO authenticated
USING (org_id = get_user_org_id());

CREATE POLICY "deny_when_org_suspended"
ON public.contract_templates AS RESTRICTIVE FOR ALL TO authenticated
USING (is_org_active(org_id)) WITH CHECK (is_org_active(org_id));

CREATE TABLE public.contract_agreements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL DEFAULT get_user_org_id(),
  reference TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.service_contracts(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  term_months INTEGER NOT NULL DEFAULT 12,
  renewal_basis TEXT,
  total_value NUMERIC NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  clauses JSONB NOT NULL DEFAULT '[]'::jsonb,
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signer_name TEXT,
  signer_role TEXT,
  signature_data TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_agreements TO authenticated;
GRANT ALL ON public.contract_agreements TO service_role;
ALTER TABLE public.contract_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins manage contract agreements"
ON public.contract_agreements FOR ALL TO authenticated
USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Org members view contract agreements"
ON public.contract_agreements FOR SELECT TO authenticated
USING (org_id = get_user_org_id());

CREATE POLICY "Portal users view their agreements"
ON public.contract_agreements FOR SELECT TO authenticated
USING (
  is_customer_user(auth.uid())
  AND customer_id = customer_user_customer_id(auth.uid())
  AND customer_user_portal_enabled(auth.uid())
  AND status IN ('sent', 'signed', 'expired')
);

CREATE POLICY "Portal users sign their agreements"
ON public.contract_agreements FOR UPDATE TO authenticated
USING (
  is_customer_user(auth.uid())
  AND customer_id = customer_user_customer_id(auth.uid())
  AND customer_user_portal_enabled(auth.uid())
  AND status = 'sent'
)
WITH CHECK (
  is_customer_user(auth.uid())
  AND customer_id = customer_user_customer_id(auth.uid())
  AND status = 'signed'
);

CREATE POLICY "deny_when_org_suspended"
ON public.contract_agreements AS RESTRICTIVE FOR ALL TO authenticated
USING (is_org_active(org_id)) WITH CHECK (is_org_active(org_id));

CREATE INDEX idx_contract_agreements_customer ON public.contract_agreements(customer_id);
CREATE INDEX idx_contract_agreements_org_status ON public.contract_agreements(org_id, status);

CREATE OR REPLACE FUNCTION public.assign_contract_agreement_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.reference IS NULL OR NEW.reference = '' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(reference, '\D', '', 'g'), '')::INTEGER), 0) + 1
      INTO next_num
      FROM public.contract_agreements
     WHERE org_id = NEW.org_id;
    NEW.reference := 'AGR-' || LPAD(next_num::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_contract_agreement_reference
BEFORE INSERT ON public.contract_agreements
FOR EACH ROW EXECUTE FUNCTION public.assign_contract_agreement_reference();

CREATE TRIGGER trg_contract_templates_updated_at
BEFORE UPDATE ON public.contract_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_contract_agreements_updated_at
BEFORE UPDATE ON public.contract_agreements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();