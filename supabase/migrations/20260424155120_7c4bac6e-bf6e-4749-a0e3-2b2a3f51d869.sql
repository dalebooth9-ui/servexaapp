-- Enable trigram extension for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index on customers.name for fast similarity search
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON public.customers USING gin (lower(name) gin_trgm_ops);

-- Table to record merge suggestions for admin review
CREATE TABLE IF NOT EXISTS public.customer_merge_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  incoming_name TEXT NOT NULL,
  existing_customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  new_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  similarity NUMERIC(4,3) NOT NULL,
  source TEXT NOT NULL DEFAULT 'the_mellor',
  related_job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cms_status ON public.customer_merge_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_cms_existing ON public.customer_merge_suggestions(existing_customer_id);

-- Status validation trigger
CREATE OR REPLACE FUNCTION public.validate_customer_merge_suggestion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'auto_merged', 'accepted', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  IF NEW.similarity < 0 OR NEW.similarity > 1 THEN
    RAISE EXCEPTION 'Similarity must be between 0 and 1';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_cms ON public.customer_merge_suggestions;
CREATE TRIGGER trg_validate_cms
  BEFORE INSERT OR UPDATE ON public.customer_merge_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.validate_customer_merge_suggestion();

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_cms_updated_at ON public.customer_merge_suggestions;
CREATE TRIGGER trg_cms_updated_at
  BEFORE UPDATE ON public.customer_merge_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.customer_merge_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view merge suggestions"
  ON public.customer_merge_suggestions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update merge suggestions"
  ON public.customer_merge_suggestions FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete merge suggestions"
  ON public.customer_merge_suggestions FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Inserts come from the service role (Mellor webhook) — no anon insert policy needed.

-- Helper function: find best matching customer above a similarity threshold
CREATE OR REPLACE FUNCTION public.find_similar_customer(
  _name TEXT,
  _threshold NUMERIC DEFAULT 0.55
)
RETURNS TABLE(id UUID, name TEXT, similarity NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.name, similarity(lower(c.name), lower(_name))::numeric AS similarity
  FROM public.customers c
  WHERE similarity(lower(c.name), lower(_name)) >= _threshold
  ORDER BY similarity(lower(c.name), lower(_name)) DESC
  LIMIT 1;
$$;