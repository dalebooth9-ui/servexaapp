UPDATE public.help_articles
SET steps = COALESCE(steps, '[]'::jsonb) || '[{"heading":"Weekly grid","items":["Each date has its own cell. Multi-day visits show a separate card on each day with its day number.","Hover over a visit to see the full job, location, engineer and dates; remove a visit from that detail panel.","If a day has more than two visits, open + more to see the rest.","Drag a job onto the date directly under the pointer to schedule or move it."]}]'::jsonb,
    category = COALESCE(category, 'Planner'),
    audience = COALESCE(audience, ARRAY['admin','engineer']),
    is_guide = true,
    guide_order = COALESCE(guide_order, 20),
    last_updated = now()
WHERE slug = 'planner';
