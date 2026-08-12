UPDATE public.help_articles
SET steps = steps || jsonb_build_array(jsonb_build_object(
  'title', 'Attach more than one RAMS to a job',
  'detail', 'Jobs often mix work types — for example dry riser remedial works plus a dry riser installation. On the job page the RAMS panel lists every RAMS attached to that job. Choose Attach RAMS and tick each work type the job covers: one separate document is created per type, each with its own trade-correct method statement and plant/equipment list — they are never merged into one hybrid RAMS. Create blank starts an extra empty RAMS on a job that already has one. Engineers see the same list on their job screen and read and sign each RAMS individually.'
)), last_updated = now()
WHERE slug = 'rams';