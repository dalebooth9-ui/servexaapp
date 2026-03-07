ALTER TABLE public.parts_library
  ADD COLUMN china_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN uk_cost numeric NOT NULL DEFAULT 0;