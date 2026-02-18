
-- Create invoices table
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  customer_name text NOT NULL DEFAULT '',
  customer_email text,
  customer_address text,
  status text NOT NULL DEFAULT 'draft',
  due_date date,
  notes text,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  tax_amount numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  paid_at timestamp with time zone,
  sent_at timestamp with time zone,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create invoice line items table
CREATE TABLE public.invoice_line_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

-- Invoice policies: admins only
CREATE POLICY "Admins can manage all invoices"
ON public.invoices FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view invoices for assigned jobs"
ON public.invoices FOR SELECT
USING (EXISTS (
  SELECT 1 FROM job_assignments ja
  WHERE ja.job_id = invoices.job_id AND ja.engineer_id = auth.uid()
));

-- Line items policies
CREATE POLICY "Admins can manage all line items"
ON public.invoice_line_items FOR ALL
USING (EXISTS (
  SELECT 1 FROM invoices i
  WHERE i.id = invoice_line_items.invoice_id AND has_role(auth.uid(), 'admin'::app_role)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM invoices i
  WHERE i.id = invoice_line_items.invoice_id AND has_role(auth.uid(), 'admin'::app_role)
));

CREATE POLICY "Engineers can view line items for assigned job invoices"
ON public.invoice_line_items FOR SELECT
USING (EXISTS (
  SELECT 1 FROM invoices i
  JOIN job_assignments ja ON ja.job_id = i.job_id
  WHERE i.id = invoice_line_items.invoice_id AND ja.engineer_id = auth.uid()
));

-- Auto-generate invoice numbers
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 5) AS integer)), 0) + 1
  INTO next_num
  FROM invoices
  WHERE invoice_number ~ '^INV-[0-9]+$';
  
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := 'INV-' || LPAD(next_num::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_invoice_number
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.generate_invoice_number();

-- Updated_at trigger
CREATE TRIGGER update_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Validation trigger for status
CREATE OR REPLACE FUNCTION public.validate_invoice_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'sent', 'paid', 'overdue', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid invoice status: %. Must be draft, sent, paid, overdue, or cancelled.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_invoice_status_trigger
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.validate_invoice_status();
