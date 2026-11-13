UPDATE public.help_articles SET
 common_problems = coalesce(common_problems,'[]'::jsonb) || jsonb_build_array(
  jsonb_build_object('problem','Red "Not saved yet" message on a report','fix','Your answers and photos are kept on this phone. Tap Retry once you have signal; the form is never cleared until the office confirms the save.'),
  jsonb_build_object('problem','A photo shows "Not uploaded — Retry"','fix','Tap the photo''s Retry. Submit stays locked until every photo shows Stored; the phone keeps a copy until then.'),
  jsonb_build_object('problem','How do I know my report went in?','fix','After Submit you see a summary of risers, answers and photos, with Reopen to check. While filling in, the bar shows Saving… / Saved.')),
 last_updated = now()
WHERE slug = 'engineer.offline';