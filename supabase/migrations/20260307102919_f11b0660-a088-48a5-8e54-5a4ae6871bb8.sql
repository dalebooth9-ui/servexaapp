ALTER TABLE public.parts_library
  ADD COLUMN list_type text NOT NULL DEFAULT 'general';

CREATE INDEX idx_parts_library_list_type ON public.parts_library (list_type);