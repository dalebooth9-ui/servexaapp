
ALTER TABLE public.paper_scan_batches
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'job'
    CHECK (mode IN ('job','archive'));

ALTER TABLE public.paper_scan_batch_items
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'job'
    CHECK (mode IN ('job','archive')),
  ADD COLUMN IF NOT EXISTS archived_document_id UUID;

CREATE TABLE IF NOT EXISTS public.archived_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  document_date DATE,
  document_type TEXT,
  template_id UUID REFERENCES public.job_sheet_templates(id) ON DELETE SET NULL,
  template_name TEXT,
  title TEXT,
  notes TEXT,
  extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
  header_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_paths TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  page_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'filed' CHECK (status IN ('filed','unmatched')),
  source_batch_id UUID,
  source_item_id UUID,
  filed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.archived_documents TO authenticated;
GRANT ALL ON public.archived_documents TO service_role;

ALTER TABLE public.archived_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins in same org can view archived documents"
ON public.archived_documents FOR SELECT
TO authenticated
USING (
  org_id = public.get_user_org_id()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'platform_admin')
  )
);

CREATE POLICY "Admins in same org can insert archived documents"
ON public.archived_documents FOR INSERT
TO authenticated
WITH CHECK (
  org_id = public.get_user_org_id()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'platform_admin')
  )
);

CREATE POLICY "Admins in same org can update archived documents"
ON public.archived_documents FOR UPDATE
TO authenticated
USING (
  org_id = public.get_user_org_id()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'platform_admin')
  )
)
WITH CHECK (
  org_id = public.get_user_org_id()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'platform_admin')
  )
);

CREATE POLICY "Admins in same org can delete archived documents"
ON public.archived_documents FOR DELETE
TO authenticated
USING (
  org_id = public.get_user_org_id()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'platform_admin')
  )
);

CREATE INDEX IF NOT EXISTS archived_documents_org_idx ON public.archived_documents(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS archived_documents_customer_idx ON public.archived_documents(customer_id);
CREATE INDEX IF NOT EXISTS archived_documents_site_idx ON public.archived_documents(site_id);
CREATE INDEX IF NOT EXISTS archived_documents_status_idx ON public.archived_documents(status);

CREATE TRIGGER update_archived_documents_updated_at
BEFORE UPDATE ON public.archived_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
