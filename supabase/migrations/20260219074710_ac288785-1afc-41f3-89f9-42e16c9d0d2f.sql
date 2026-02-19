
-- Add sell_price column for product uplift/profit tracking
ALTER TABLE public.job_parts ADD COLUMN sell_price numeric NOT NULL DEFAULT 0;

-- Add a computed profit helper comment (profit = (sell_price - unit_cost) * quantity)
COMMENT ON COLUMN public.job_parts.sell_price IS 'Customer-facing sell price per unit. Profit = (sell_price - unit_cost) * quantity';
