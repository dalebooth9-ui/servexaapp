INSERT INTO public.help_articles (slug, route_pattern, title, purpose, steps, common_problems, related_slugs, keywords)
VALUES (
  'defects.ai-draft-quote',
  '/defects',
  'Draft a remedial quote from defects (AI)',
  'Turn open defects into a draft remedial quote. The assistant groups the defects by system and location, writes the line descriptions from the defect wording, and suggests prices from your price book. Nothing is ever sent to the customer automatically.',
  '[
    {"heading":"From the Defects list","items":[
      "Go to Defects and tick the defects you want to quote (they must all be at the same site and not already quoted).",
      "Click \"Draft quote from N selected\".",
      "You land on the new draft quote. Review the wording, fill in any blank prices, add or delete lines, then use the normal quote flow to send it."
    ]},
    {"heading":"From a customer","items":[
      "Open the customer and find the \"Outstanding defects\" section.",
      "Tick the defects (including any that came from scanned archive reports) and click \"Draft quote from N selected\"."
    ]},
    {"heading":"What the AI does and does not do","items":[
      "It writes descriptions and groupings only from the defect records you selected — it never invents work, quantities or prices.",
      "Where defects mention different levels or locations, it writes a separate line for each (e.g. \"— Level 2\" and \"— Level 4\").",
      "Prices only ever come from your price book. Lines with no match are left blank and flagged in amber.",
      "Anything unclear (e.g. quantity not stated) is flagged for you rather than guessed.",
      "The quote is created as a DRAFT and labelled as AI-drafted in its history."
    ]}
  ]'::jsonb,
  '[
    {"problem":"Every line says \"no price book match\"","fix":"Your price book is empty or does not cover this work. Add items in Settings → Price Book, or just type the prices straight onto the draft quote."},
    {"problem":"\"All defects must belong to the same site\"","fix":"A quote covers one site. Select the defects for one site, draft that quote, then repeat for the next site."},
    {"problem":"\"One or more of those defects is already on a quote\"","fix":"Open the existing quote from the defect row instead, or clear the link before re-quoting."},
    {"problem":"The wording is not how we quote","fix":"Edit the draft freely — the AI output is only a starting point and your edits are what the customer sees."}
  ]'::jsonb,
  ARRAY['defects','quotes','pricebook'],
  ARRAY['defect','quote','remedial','ai','draft','price book','estimate','quoting']
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  purpose = EXCLUDED.purpose,
  steps = EXCLUDED.steps,
  common_problems = EXCLUDED.common_problems,
  related_slugs = EXCLUDED.related_slugs,
  keywords = EXCLUDED.keywords,
  last_updated = now();