-- 1) Delete the empty submitted response for M&S Dumfries (no signature, no real answers)
DELETE FROM public.job_sheet_responses
WHERE id = '4dad2d07-8687-4bbe-8066-2f9baba04139';

-- 2) De-duplicate blank_job_sheet job_documents, keeping the earliest per (job_id, label)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY job_id, lower(coalesce(label, ''))
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.job_documents
  WHERE document_type = 'blank_job_sheet'
    AND label IS NOT NULL
)
DELETE FROM public.job_documents jd
USING ranked r
WHERE jd.id = r.id AND r.rn > 1;

-- 3) Prevent future duplicates at the database level.
CREATE UNIQUE INDEX IF NOT EXISTS job_documents_blank_sheet_unique
  ON public.job_documents (job_id, document_type, lower(label))
  WHERE document_type = 'blank_job_sheet' AND label IS NOT NULL;