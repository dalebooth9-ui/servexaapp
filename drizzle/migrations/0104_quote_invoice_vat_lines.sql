ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS vat_rate numeric CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100)),
  ADD COLUMN IF NOT EXISTS vat_exempt boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.invoice_recalc_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s numeric; v numeric; n int;
BEGIN
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  SELECT count(*), coalesce(sum(quantity*unit_price),0) INTO n, s FROM public.invoice_line_items WHERE invoice_id = NEW.id;
  IF n = 0 THEN RETURN NEW; END IF;
  SELECT coalesce(sum(round(g.base * g.rate / 100, 2)),0) INTO v FROM (
    SELECT CASE WHEN vat_exempt THEN 0 ELSE coalesce(vat_rate, coalesce(NEW.tax_rate,0)) END AS rate, sum(quantity*unit_price) AS base
    FROM public.invoice_line_items WHERE invoice_id = NEW.id GROUP BY 1) g;
  NEW.subtotal := round(s,2); NEW.tax_amount := v; NEW.total := round(s,2) + v;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_recalc_totals ON public.invoices;
CREATE TRIGGER trg_invoice_recalc_totals BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.invoice_recalc_totals();

CREATE OR REPLACE FUNCTION public.invoice_lines_touch_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.invoices SET updated_at = now() WHERE id = coalesce(NEW.invoice_id, OLD.invoice_id);
  IF TG_OP = 'UPDATE' AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
    UPDATE public.invoices SET updated_at = now() WHERE id = OLD.invoice_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_lines_touch_invoice ON public.invoice_line_items;
CREATE TRIGGER trg_invoice_lines_touch_invoice AFTER INSERT OR UPDATE OR DELETE ON public.invoice_line_items FOR EACH ROW EXECUTE FUNCTION public.invoice_lines_touch_invoice();