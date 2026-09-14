ALTER TABLE public.rams_documents
  ADD COLUMN IF NOT EXISTS personnel_list jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approver_name text,
  ADD COLUMN IF NOT EXISTS approver_role text,
  ADD COLUMN IF NOT EXISTS approval_date text,
  ADD COLUMN IF NOT EXISTS approver_signature text,
  ADD COLUMN IF NOT EXISTS supervisor_name text,
  ADD COLUMN IF NOT EXISTS supervisor_role text,
  ADD COLUMN IF NOT EXISTS supervisor_contact text,
  ADD COLUMN IF NOT EXISTS supervisor_signature text;