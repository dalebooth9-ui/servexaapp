insert into public.help_articles (slug, route_pattern, title, purpose, steps, common_problems, related_slugs, keywords, source_paths, is_guide, category, audience, guide_order)
values (
 'report-autosave-and-updates', null, 'Unsaved report work and app updates',
 'Report answers are kept on your device as you type, and Servexa never reloads itself in the middle of a report.',
 '["Fill in a report as normal — answers are saved on this device about every half second and again when you leave the app.","If the app or page reloads, open the job again: the report you had open reopens with a note saying when your work was restored.","Switching between pressure test and visual inspection keeps you on the same report; pressure-test-only answers are hidden but come back if you switch back.","When a new version is ready, a small notice appears once on the dashboard or job list — never over a report. Tap Update now, or Later to update next time you open the app.","Your version number is shown at the bottom of the menu."]'::jsonb,
 '["Restored answers are only on this device until you tap Save or Submit.","Photos you picked but had not yet saved may need adding again after a reload."]'::jsonb,
 array['jobs.detail'],
 array['autosave','lost work','restore','update','new version','reload','switch to visual'],
 array['src/components/JobSheetTemplates.tsx','src/components/PWAPrompts.tsx','src/pwa/registerSW.ts'],
 true, 'Jobs & reports', array['admin','engineer'], 90
)
on conflict (slug) do update set title=excluded.title, purpose=excluded.purpose, steps=excluded.steps, common_problems=excluded.common_problems, keywords=excluded.keywords, source_paths=excluded.source_paths, is_guide=excluded.is_guide, category=excluded.category, audience=excluded.audience, guide_order=excluded.guide_order, last_updated=now();