
ALTER TABLE public.job_documents 
  DROP CONSTRAINT job_documents_source_check;

ALTER TABLE public.job_documents 
  ADD CONSTRAINT job_documents_source_check 
  CHECK (source = ANY (ARRAY['auto'::text, 'manual'::text, 'customer_paperwork'::text]));
