-- Backfill: convert expired signed / public URLs stored in job_documents.file_url
-- into a durable "storage://<bucket>/<path>" reference. Viewers mint fresh
-- signed URLs at display time via src/lib/durableStorageRef.ts.
--
-- Only rows that clearly encode a Supabase storage object URL are rewritten;
-- external URLs, storage:// refs, and bare paths are left alone.
UPDATE public.job_documents
SET file_url = 'storage://'
  || (regexp_match(file_url, '/object/(?:public|sign)/([^/]+)/([^?#]+)'))[1]
  || '/'
  || (regexp_match(file_url, '/object/(?:public|sign)/([^/]+)/([^?#]+)'))[2]
WHERE file_url IS NOT NULL
  AND file_url ~ '/object/(?:public|sign)/[^/]+/[^?#]+'
  AND file_url NOT LIKE 'storage://%';