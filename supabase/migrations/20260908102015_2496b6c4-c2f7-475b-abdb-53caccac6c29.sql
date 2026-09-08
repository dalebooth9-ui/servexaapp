INSERT INTO public.help_articles (slug, route_pattern, title, purpose, steps, common_problems, related_slugs, keywords)
VALUES (
  'assistant.ask-your-data',
  NULL,
  'Ask the assistant about your data',
  'The Servexa Assistant can now answer questions about your own organisation''s records — jobs, customers, sites, defects, assets, contracts and renewals, planner visits and archived documents — as well as the usual "how do I…" help questions.',
  '[
    {"heading":"Ask a question about your records","items":[
      "Open the assistant with the AI Help button (bottom right).",
      "Type a question in plain English, e.g. \"dry riser jobs with outstanding defects at the Slate Yard\", \"which customers have renewals due next month\", \"how many jobs did Martin complete last week\".",
      "The assistant looks up the matching records and answers with a short summary.",
      "Under the answer, tap any record in \"Records used\" to open it and check the detail yourself."
    ]},
    {"heading":"Mixing help and data questions","items":[
      "\"How do I…\" questions are still answered from the help notes.",
      "Questions about your records go to the data lookup automatically — there is nothing to switch."
    ]},
    {"heading":"What it will not do","items":[
      "It is read-only: it can never create, change or delete anything.",
      "It only ever sees your own organisation''s records, using your own access permissions.",
      "It will not book jobs, assign engineers or send emails yet — those actions are planned for a later release."
    ]}
  ]'::jsonb,
  '[
    {"problem":"\"You have reached today''s limit of data questions\"","fix":"Each organisation has a daily allowance of data questions (200 by default). It resets at midnight. How-to help questions still work in the meantime; contact Servexa support if you need a higher allowance."},
    {"problem":"The assistant says nothing matched","fix":"It never invents records. Try a wider question (drop the date range, or use part of the customer or site name) or check the spelling of the name."},
    {"problem":"It asks a clarifying question","fix":"That means more than one customer or site could match — reply with the full name and it will run the lookup."}
  ]'::jsonb,
  ARRAY['jobs','customers','defects','contracts','planner','archive'],
  ARRAY['ai','assistant','ask','search','question','data','report','how many','which','find']
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  purpose = EXCLUDED.purpose,
  steps = EXCLUDED.steps,
  common_problems = EXCLUDED.common_problems,
  related_slugs = EXCLUDED.related_slugs,
  keywords = EXCLUDED.keywords,
  last_updated = now();