INSERT INTO public.help_articles (slug, route_pattern, title, purpose, steps, common_problems, keywords, category, audience, is_guide, guide_order, last_updated)
VALUES
('navigation', NULL, 'Finding your way around the menu',
 'The left-hand menu is the same on every screen. Items are grouped so you can fold away the parts you do not use.',
 '["Menu items sit in six groups: Work, Customers, Commercial, Compliance, Resources and Insights.","Tap a group heading to fold it away or open it again — your choice is remembered on this device.","The group containing the page you are on always stays open.","Help & guides, Sync status, My tickets and Settings are pinned at the bottom.","Engineers see a short flat list of only the pages they are allowed to open."]'::jsonb,
 '["A page is missing: it is either inside a folded group, or your role does not have access to it."]'::jsonb,
 ARRAY['menu','navigation','sidebar','groups'], 'Getting started', ARRAY['admin','engineer'], true, 5, now()),
('dashboard.attention', '/', 'Needs attention today',
 'The dashboard leads with the handful of things that need a decision today, each one a live count you can tap.',
 '["Overdue jobs — past their due date and not finished.","Reports awaiting review — engineer paperwork waiting on the office.","Defects awaiting quote — open defects with no quote yet.","Quotes expiring — quotes reaching their valid-until date within a week.","Completed, not invoiced — finished jobs with no invoice raised.","Jobs scheduled today — what the team is out doing.","Underneath, a this-week strip shows jobs completed, defects raised and invoices outstanding.","The get-started checklist disappears by itself once every step is ticked."]'::jsonb,
 '["A count shows zero: nothing matches right now — the figures are live, nothing is estimated."]'::jsonb,
 ARRAY['dashboard','today','attention','overdue'], 'Getting started', ARRAY['admin'], true, 6, now()),
('jobs.smart-views', '/jobs', 'One-tap job filters',
 'Chips above the jobs list jump straight to the jobs that need work, each showing a live count.',
 '["Due today — scheduled today or due today.","Overdue — past the due date and still open.","Awaiting report — paperwork waiting for review.","Defects raised — jobs with an open defect.","Ready to invoice — completed with no invoice.","Unassigned — nobody booked on yet.","Tap a chip again, or Clear view, to go back to the full list."]'::jsonb,
 '["A chip shows fewer jobs than expected: clear any search text and other filters first."]'::jsonb,
 ARRAY['jobs','filters','chips','overdue','unassigned'], 'Jobs', ARRAY['admin'], true, 12, now()),
('jobs.timeline', NULL, 'The job progress strip',
 'Every job page shows how far the job has got, worked out from what has actually happened.',
 '["Booked — the job exists.","Scheduled — it is in the planner.","On site — an engineer has started work or uploaded something.","Report complete — a job sheet has been submitted.","Reviewed — the office has approved or amended it.","Sent to customer — an email has gone out on the job.","Invoiced — an invoice is linked to the job.","The strip is for information only; you still work through the tabs as before."]'::jsonb,
 '["A stage is not ticked: the underlying step has not happened yet — the strip never guesses."]'::jsonb,
 ARRAY['job','progress','timeline','stages'], 'Jobs', ARRAY['admin'], true, 13, now()),
('rams.auto-attach', '/settings/rams-library', 'Attach RAMS automatically by job type',
 'Choose one RAMS per job type and it is copied onto every new job of that type as a draft.',
 '["Go to Settings, then RAMS Library, then the Auto-attach by job type tab.","For each job type, pick the RAMS to copy, or leave it as no automatic attachment.","New jobs of that type get their own editable draft copy — the original is untouched.","Engineers still read and sign as usual.","Change or remove a choice at any time; existing jobs are not affected."]'::jsonb,
 '["The list of RAMS is empty: create a RAMS on a job first, then set it as the default here."]'::jsonb,
 ARRAY['rams','auto attach','job type','templates'], 'Safety', ARRAY['admin'], true, 25, now()),
('engineer.today-cards', NULL, 'What is on your job cards',
 'Each job card on your Today screen tells you what you are walking into before you arrive.',
 '["Open defects already recorded at that site.","The date of the last completed visit to that site.","Whether RAMS are attached and whether they have been signed.","Navigate opens directions; Open job takes you into the paperwork."]'::jsonb,
 '["It says no previous visit: nobody has completed a job at that site in this system yet."]'::jsonb,
 ARRAY['engineer','today','cards','defects','rams'], 'For engineers', ARRAY['engineer'], true, 8, now())
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, purpose = EXCLUDED.purpose, steps = EXCLUDED.steps,
  common_problems = EXCLUDED.common_problems, keywords = EXCLUDED.keywords,
  category = EXCLUDED.category, audience = EXCLUDED.audience,
  is_guide = EXCLUDED.is_guide, guide_order = EXCLUDED.guide_order, last_updated = now();

UPDATE public.help_articles
SET purpose = purpose || ' The planner toolbar now shows date navigation, Add Entry and the engineer filter; AI Schedule, Auto-Agent, Labour, Batch Deploy, Shunt, Copy Week, Print sheets and Export all live in the ••• menu.',
    last_updated = now()
WHERE slug = 'planner' AND purpose NOT LIKE '%••• menu%';