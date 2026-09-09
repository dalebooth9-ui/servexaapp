UPDATE public.help_articles
SET steps = steps || jsonb_build_array('Compliance record: once a job reaches review or completion, a "Compliance record" block on the Overview tab gathers the evidence — engineer, completion date, submitted reports, engineer and customer signatures, photo count, RAMS acknowledgement, defects raised, amendments and whether it was sent to the customer. The score counts only the items that apply to that job, and any missing item is listed underneath.'),
    last_updated = now()
WHERE slug = 'jobs.detail';

UPDATE public.help_articles
SET steps = steps || jsonb_build_array('The "Evidence complete" chip in the at-a-glance strip shows how many of the customer''s completed jobs carry the full evidence set (report, both signatures, sent to the customer). Tap it to open the customer''s jobs.'),
    last_updated = now()
WHERE slug = 'customers.detail';

UPDATE public.help_articles
SET steps = steps || jsonb_build_array('"Delivery against this agreement" shows visits included this term (worked out from the service lines and term length), visits completed, visits remaining, the next planned visit, the renewal countdown (amber inside 60 days), open defects at the covered sites with any quoted value, and every quote or invoice raised against those sites.'),
    last_updated = now()
WHERE slug = 'agreements';

UPDATE public.help_articles
SET steps = steps || jsonb_build_array('"Needs attention today" also flags high-priority defects that have not been quoted, quotes sent more than 14 days ago with no reply, and agreements expiring within 30 days. Every tile is a live count and taps through to the matching list.'),
    last_updated = now()
WHERE slug = 'dashboard';

UPDATE public.help_articles
SET steps = steps || jsonb_build_array('Prefill from last visit: when a sheet is opened for a site where the same sheet was completed before, a banner offers to copy the standing details forward (asset details, counts, equipment information). Checks, pass/fail answers, comments, dates and signatures are never copied — they must be recorded fresh. Copied boxes are highlighted until they are touched.'),
    last_updated = now()
WHERE slug = 'reports';