-- External RAMS: documents produced outside Servexa (client's, principal
-- contractor's, or written in Word) attached to a job. Stored as ordinary
-- rams_documents rows flagged is_external so every existing RAMS check,
-- indicator and pack treats them as a valid RAMS.
ALTER TABLE public.rams_documents
  ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_file_path text,
  ADD COLUMN IF NOT EXISTS external_file_url text,
  ADD COLUMN IF NOT EXISTS external_file_name text,
  ADD COLUMN IF NOT EXISTS external_mime text,
  ADD COLUMN IF NOT EXISTS issued_by text,
  ADD COLUMN IF NOT EXISTS external_approval_status text,
  ADD COLUMN IF NOT EXISTS valid_until date,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid;

CREATE INDEX IF NOT EXISTS rams_documents_external_idx
  ON public.rams_documents (job_id) WHERE is_external;

-- Org-level library of external RAMS that can be reused across jobs.
ALTER TABLE public.rams_library_items
  ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_file_path text,
  ADD COLUMN IF NOT EXISTS external_file_url text,
  ADD COLUMN IF NOT EXISTS external_file_name text,
  ADD COLUMN IF NOT EXISTS issued_by text,
  ADD COLUMN IF NOT EXISTS valid_until date;