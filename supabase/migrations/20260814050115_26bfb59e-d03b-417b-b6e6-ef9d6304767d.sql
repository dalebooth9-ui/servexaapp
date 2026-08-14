DO $$
DECLARE keep uuid := '2ec58c0d-242e-4194-8830-4fd7e82b974f';
        dup  uuid := 'dfc2c96e-cfa7-4c42-9018-4a841bcb08da';
BEGIN
  -- 1. Move any document from the duplicate that the keeper does not already have (by file name)
  UPDATE public.job_documents d
     SET job_id = keep
   WHERE d.job_id = dup
     AND NOT EXISTS (
       SELECT 1 FROM public.job_documents p
        WHERE p.job_id = keep
          AND coalesce(p.file_name,'') = coalesce(d.file_name,'')
          AND coalesce(p.document_type,'') = coalesce(d.document_type,'')
     );

  -- 2. Remove the remaining duplicate attachments
  DELETE FROM public.job_documents WHERE job_id = dup;

  -- 3. Remove the empty, unstarted sheet draft on the duplicate
  DELETE FROM public.job_sheet_responses
   WHERE job_id = dup
     AND status = 'draft'
     AND (responses IS NULL OR responses = '{}'::jsonb);

  -- 4. Delete the duplicate job
  DELETE FROM public.jobs WHERE id = dup;
END $$;