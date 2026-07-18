ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS brand_colour text;
COMMENT ON COLUMN public.customers.brand_colour IS 'Hex colour (e.g. #c8102e) used to tint the standard flame watermark on customer-branded PDFs. NULL falls back to neutral grey.';

-- Seed Besseges Fire Protection with their red so their PDFs render the same
-- red flame the previous per-customer watermark asset used.
UPDATE public.customers SET brand_colour = '#c8102e' WHERE id = 'fb2b86bb-dca7-4059-8139-057ba1d904e4' AND brand_colour IS NULL;