
-- Add document_type column to invoices table
ALTER TABLE public.invoices 
ADD COLUMN document_type text NOT NULL DEFAULT 'invoice';

-- Update validation trigger to handle both invoice and quote statuses
CREATE OR REPLACE FUNCTION public.validate_invoice_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate document_type
  IF NEW.document_type NOT IN ('invoice', 'quote') THEN
    RAISE EXCEPTION 'Invalid document type: %. Must be invoice or quote.', NEW.document_type;
  END IF;

  -- Validate status based on document_type
  IF NEW.document_type = 'invoice' THEN
    IF NEW.status NOT IN ('draft', 'sent', 'paid', 'overdue', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid invoice status: %. Must be draft, sent, paid, overdue, or cancelled.', NEW.status;
    END IF;
  ELSIF NEW.document_type = 'quote' THEN
    IF NEW.status NOT IN ('draft', 'sent', 'accepted', 'declined') THEN
      RAISE EXCEPTION 'Invalid quote status: %. Must be draft, sent, accepted, or declined.', NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Update invoice number generation to support QUO- prefix for quotes
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num integer;
  prefix text;
  pattern text;
BEGIN
  IF NEW.document_type = 'quote' THEN
    prefix := 'QUO-';
    pattern := '^QUO-[0-9]+$';
  ELSE
    prefix := 'INV-';
    pattern := '^INV-[0-9]+$';
  END IF;

  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM LENGTH(prefix) + 1) AS integer)), 0) + 1
    INTO next_num
    FROM invoices
    WHERE invoice_number ~ pattern;
    
    NEW.invoice_number := prefix || LPAD(next_num::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$function$;
