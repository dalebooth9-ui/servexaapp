UPDATE public.help_articles
SET steps = steps || jsonb_build_array(jsonb_build_object(
  'heading', 'Read the at-a-glance strip',
  'items', jsonb_build_array(
    'The row of small tiles under the customer header is live: jobs (total and active), open defects, reports awaiting review, quotes still out with their value, active agreements with the soonest renewal, renewals due in the next 90 days, and archived documents.',
    'Tap any tile to open that list already filtered to this customer.',
    'A tile showing zero stays on screen but is greyed out, so the row always looks the same.',
    'Defects turn red when there are any open, and agreements turn amber when the soonest one renews within 60 days.'
  )
))
WHERE slug = 'customers.detail';

UPDATE public.help_articles
SET steps = steps || jsonb_build_array(jsonb_build_object(
  'heading', 'Site at a glance',
  'items', jsonb_build_array(
    'When you open a job, the Site history card starts with a live summary for that site: jobs (total and active), open defects, the last visit date, the next planned visit and archived documents.',
    'Tap a tile to jump to that list filtered to the site.'
  )
))
WHERE slug = 'sites';