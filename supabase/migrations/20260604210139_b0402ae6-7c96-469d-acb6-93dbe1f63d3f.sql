
-- van_stock
CREATE TABLE public.van_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  engineer_id uuid NOT NULL,
  part_id uuid NOT NULL REFERENCES public.parts_library(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  min_quantity integer NOT NULL DEFAULT 2,
  last_restocked timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engineer_id, part_id)
);
CREATE INDEX idx_van_stock_engineer ON public.van_stock(engineer_id);
CREATE INDEX idx_van_stock_org ON public.van_stock(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.van_stock TO authenticated;
GRANT ALL ON public.van_stock TO service_role;
ALTER TABLE public.van_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Engineers view own van stock" ON public.van_stock
FOR SELECT TO authenticated
USING (engineer_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Engineers update own van stock" ON public.van_stock
FOR UPDATE TO authenticated
USING (engineer_id = auth.uid() OR has_role(auth.uid(), 'admin'))
WITH CHECK (engineer_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins or self insert van stock" ON public.van_stock
FOR INSERT TO authenticated
WITH CHECK (engineer_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete van stock" ON public.van_stock
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_van_stock_updated_at BEFORE UPDATE ON public.van_stock
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- stock_transactions
CREATE TABLE public.stock_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  van_stock_id uuid REFERENCES public.van_stock(id) ON DELETE CASCADE,
  engineer_id uuid NOT NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  transaction_type text NOT NULL,
  quantity_change integer NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_tx_engineer ON public.stock_transactions(engineer_id);
CREATE INDEX idx_stock_tx_van ON public.stock_transactions(van_stock_id);
CREATE INDEX idx_stock_tx_status ON public.stock_transactions(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transactions TO authenticated;
GRANT ALL ON public.stock_transactions TO service_role;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Engineers view own stock tx" ON public.stock_transactions
FOR SELECT TO authenticated
USING (engineer_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Engineers insert own stock tx" ON public.stock_transactions
FOR INSERT TO authenticated
WITH CHECK (engineer_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update stock tx" ON public.stock_transactions
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete stock tx" ON public.stock_transactions
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Validate transaction_type
CREATE OR REPLACE FUNCTION public.validate_stock_transaction()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.transaction_type NOT IN ('used','restocked','transferred','adjustment','restock_requested','restock_approved') THEN
    RAISE EXCEPTION 'Invalid stock transaction type: %', NEW.transaction_type;
  END IF;
  IF NEW.status NOT IN ('pending','completed','rejected') THEN
    RAISE EXCEPTION 'Invalid stock transaction status: %', NEW.status;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER validate_stock_tx BEFORE INSERT OR UPDATE ON public.stock_transactions
FOR EACH ROW EXECUTE FUNCTION public.validate_stock_transaction();
