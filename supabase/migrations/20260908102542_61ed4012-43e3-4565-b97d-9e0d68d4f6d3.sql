ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS ai_drafted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_draft_notes text;

ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS price_match text,
  ADD COLUMN IF NOT EXISTS ai_flag text,
  ADD COLUMN IF NOT EXISTS source_defect_ids uuid[];

COMMENT ON COLUMN public.invoices.ai_drafted IS 'True when the quote was first drafted by the AI defect-to-quote assistant.';
COMMENT ON COLUMN public.invoice_line_items.price_match IS 'matched | unmatched — whether a price book item was found for this line.';
COMMENT ON COLUMN public.invoice_line_items.ai_flag IS 'Free-text ambiguity note raised by the AI drafter for a human to resolve.';