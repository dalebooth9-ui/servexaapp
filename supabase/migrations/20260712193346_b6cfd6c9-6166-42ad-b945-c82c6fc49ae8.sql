
-- Import Wizard infrastructure

CREATE TABLE public.import_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('customers','sites','assets')),
  source_filename TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  merged_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','complete','failed','undone')),
  error_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view their org import batches"
  ON public.import_batches FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert import batches in their org"
  ON public.import_batches FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update their org import batches"
  ON public.import_batches FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.get_user_org_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete their org import batches"
  ON public.import_batches FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER import_batches_set_updated_at
  BEFORE UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add batch tagging columns to imported entities
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_customers_import_batch_id ON public.customers(import_batch_id) WHERE import_batch_id IS NOT NULL;

ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_sites_import_batch_id ON public.sites(import_batch_id) WHERE import_batch_id IS NOT NULL;

ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_assets_import_batch_id ON public.assets(import_batch_id) WHERE import_batch_id IS NOT NULL;
