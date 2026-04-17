-- Extend engineer_documents with skill matrix fields (idempotent)
ALTER TABLE public.engineer_documents
  ADD COLUMN IF NOT EXISTS certification_type text,
  ADD COLUMN IF NOT EXISTS issuing_body text,
  ADD COLUMN IF NOT EXISTS certificate_number text,
  ADD COLUMN IF NOT EXISTS date_obtained date;

CREATE INDEX IF NOT EXISTS idx_engineer_documents_certification_type
  ON public.engineer_documents(certification_type);

CREATE INDEX IF NOT EXISTS idx_engineer_documents_engineer_id
  ON public.engineer_documents(engineer_id);