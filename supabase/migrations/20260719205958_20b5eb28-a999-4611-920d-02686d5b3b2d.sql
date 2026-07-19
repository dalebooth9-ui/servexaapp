
ALTER TABLE public.paper_scan_batches
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'job'
    CHECK (mode IN ('job','archive'));

ALTER TABLE public.paper_scan_batch_items
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'job'
    CHECK (mode IN ('job','archive'));

ALTER TABLE public.paper_scan_batch_items
  ADD COLUMN IF NOT EXISTS archived_document_id uuid NULL;

CREATE TABLE IF NOT EXISTS public.archived_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  site_id uuid NULL REFERENCES public.sites(id) ON DELETE SET NULL,
  document_date date NULL,
  document_type text NULL,
  template_id uuid NULL,
  template_name text NULL,
  title text NULL,
  notes text NULL,
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  header_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  file_paths text[] NOT NULL DEFAULT '{}'::text[],
  page_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'filed'
    CHECK (status IN ('filed','unmatched')),
  source_batch_id uuid NULL,
  source_item_id uuid NULL,
  filed_by uuid NULL,
  filed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archived_documents_org ON public.archived_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_archived_documents_customer ON public.archived_documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_archived_documents_site ON public.archived_documents(site_id);
CREATE INDEX IF NOT EXISTS idx_archived_documents_date ON public.archived_documents(document_date);
CREATE INDEX IF NOT EXISTS idx_archived_documents_type ON public.archived_documents(document_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.archived_documents TO authenticated;
GRANT ALL ON public.archived_documents TO service_role;

ALTER TABLE public.archived_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage archived docs in their org"
  ON public.archived_documents
  FOR ALL
  TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role)
  )
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role)
  );

CREATE POLICY "Service role full access archived docs"
  ON public.archived_documents
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_archived_documents_updated_at
  BEFORE UPDATE ON public.archived_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
