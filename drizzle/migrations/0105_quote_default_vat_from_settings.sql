ALTER TABLE public.invoices ALTER COLUMN tax_rate DROP DEFAULT;
CREATE OR REPLACE FUNCTION public.invoice_default_vat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v numeric;
BEGIN
  IF NEW.tax_rate IS NULL THEN
    SELECT CASE WHEN (value->>'default_vat_rate') ~ '^[0-9]+(\.[0-9]+)?$' THEN (value->>'default_vat_rate')::numeric END
      INTO v FROM public.app_settings WHERE org_id = NEW.org_id AND key = 'quote_invoice_settings';
    NEW.tax_rate := coalesce(v, 20);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_invoices_zz_default_vat ON public.invoices;
CREATE TRIGGER trg_invoices_zz_default_vat BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.invoice_default_vat();