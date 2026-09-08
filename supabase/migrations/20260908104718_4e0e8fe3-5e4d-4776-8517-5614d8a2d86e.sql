INSERT INTO public.help_articles (slug, route_pattern, title, purpose, steps, common_problems, related_slugs, keywords)
VALUES (
  'reports.ai-summary',
  '/settings',
  'AI report summaries for customers',
  'Print a short plain-English summary at the top of a customer report: what was done, the overall outcome, any defects found with their locations, and what you recommend next. It is written only from that report''s own answers and defects, it is off until you switch it on, and nothing goes out until you have read it.',
  '[
    {"heading":"Switch it on","items":[
      "Go to Settings, then Advanced document settings, then AI report summaries, and turn the switch on. It is off for every company until an admin enables it.",
      "It then applies to both live job reports and converted archive scans."
    ]},
    {"heading":"On a completed job report","items":[
      "Open the job and find the completed report under Job Sheets.",
      "Use Draft with AI to write the summary, edit the wording however you like, then Save.",
      "Download or send the report — the summary prints in a Summary box just below the header.",
      "Regenerate rewrites it from the current answers; the bin icon removes it entirely."
    ]},
    {"heading":"On an archived scan","items":[
      "Open the document from the Archive library.",
      "Draft, edit and save the summary the same way. Saving rebuilds the electronic report PDF straight away — it does not re-read the scan."
    ]},
    {"heading":"What it will and will not say","items":[
      "It only uses answers actually filled in on that report and defects recorded against it.",
      "It never invents findings, and it does not add its own severity or risk opinions.",
      "If nothing adverse was found it simply says so.",
      "You can overwrite every word — what you save is what the customer sees."
    ]}
  ]'::jsonb,
  '[
    {"problem":"I cannot see the Draft with AI box","fix":"The feature is off for your company, or you are not an admin. Ask an admin to enable it in Settings, Advanced document settings, AI report summaries."},
    {"problem":"The summary is too vague","fix":"Usually the report has very few filled-in answers. Complete the sheet then hit Regenerate, or just type the summary yourself."},
    {"problem":"The summary did not appear on the PDF","fix":"Make sure you pressed Save. The PDF only prints a saved summary."},
    {"problem":"We do not want summaries on our reports","fix":"Turn the setting off, or remove the summary on individual reports with the bin icon."}
  ]'::jsonb,
  ARRAY['settings','jobs.detail','paper-scans'],
  ARRAY['summary','ai','report','pdf','customer','plain english','archive','conversion']
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  purpose = EXCLUDED.purpose,
  steps = EXCLUDED.steps,
  common_problems = EXCLUDED.common_problems,
  related_slugs = EXCLUDED.related_slugs,
  keywords = EXCLUDED.keywords,
  last_updated = now();