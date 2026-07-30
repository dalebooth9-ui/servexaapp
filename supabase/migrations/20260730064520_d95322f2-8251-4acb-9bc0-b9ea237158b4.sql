update public.job_site_survey_photos p
set file_path = o.name
from storage.objects o
where o.bucket_id = 'site-survey-media'
  and o.name like '%/' || p.file_path
  and not exists (
    select 1 from storage.objects oe
    where oe.bucket_id = 'site-survey-media' and oe.name = p.file_path
  );

update public.site_survey_photos p
set file_path = o.name
from storage.objects o
where o.bucket_id = 'site-survey-media'
  and o.name like '%/' || p.file_path
  and not exists (
    select 1 from storage.objects oe
    where oe.bucket_id = 'site-survey-media' and oe.name = p.file_path
  );