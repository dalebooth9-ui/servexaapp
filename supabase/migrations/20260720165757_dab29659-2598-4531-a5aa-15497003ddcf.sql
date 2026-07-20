ALTER TABLE public.archived_documents
  ADD COLUMN IF NOT EXISTS report_pdf_path text;
COMMENT ON COLUMN public.archived_documents.report_pdf_path IS 'Storage path (submissions bucket) to the electronic PDF report generated from the extracted answers. Null when no template matched.';