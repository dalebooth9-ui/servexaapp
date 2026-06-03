UPDATE public.job_sheet_responses
SET responses = responses || jsonb_build_object(
  '_site_photo_paths', jsonb_build_array(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/site-photo-1780496984366-jcs9lt.jpeg',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/site-photo-1780496986767-qvjtv0.jpeg'
  )
)
WHERE id = '0d0f63fb-6c31-40da-8b46-ff3068651786';

INSERT INTO public.submissions (job_id, engineer_id, type, file_url, file_name)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid,
       'bdf890d7-4d88-4993-aebc-a3e9c39cf7ce'::uuid,
       'photo',
       o.name,
       split_part(o.name, '/', 2)
FROM storage.objects o
WHERE o.bucket_id='submissions'
  AND o.name IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/site-photo-1780496984366-jcs9lt.jpeg',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/site-photo-1780496986767-qvjtv0.jpeg'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.submissions s WHERE s.file_url LIKE '%' || split_part(o.name, '/', 2)
  );