UPDATE public.help_articles SET
  title = 'Working without signal & sync status',
  purpose = 'How Servexa keeps your work safe with no signal: answers saved on the device, and anything waiting to send listed on the Sync status screen.',
  steps = '[
    {"heading":"Your answers are always saved on the device","items":["As you fill in a job sheet, every answer is saved on your phone or tablet against that job and that sheet.","Close the tab, lose signal or restart the device — reopen the sheet and your answers are still there."]},
    {"heading":"Items waiting for signal","items":["Sign and submit with no signal and the report is stored on the device; a pill appears at the bottom: \"1 item waiting for signal\".","Photos and edits queue the same way. Tap the pill to open Sync status.","Sync status lists reports waiting to send, pending photos, pending changes, conflicts and recent syncs.","Everything sends automatically when you are back in range, or tap Sync now."]},
    {"heading":"Offline banner","items":["While you have no signal an amber banner sits at the top: No signal — your work is saved on this device and will send automatically."]}
  ]'::jsonb,
  common_problems = '[
    {"problem":"Will my report send twice?","solution":"No. A queued report always updates the same report, however many times it retries."},
    {"problem":"An item stays in the list","solution":"Open Sync status to see the reason shown under the item, and tap Sync now once you have signal."}
  ]'::jsonb,
  keywords = ARRAY['offline','no signal','queue','sync','waiting for signal','basement'],
  last_updated = now()
WHERE slug = 'sync-status';

INSERT INTO public.help_articles (slug, route_pattern, title, purpose, steps, common_problems, related_slugs, keywords, source_paths)
VALUES (
  'engineer.today', '/', 'Your Today screen',
  'The engineer home screen: today''s jobs as big cards with Navigate and Open job, tomorrow collapsed below, and voice dictation on text boxes.',
  '[
    {"heading":"Today''s jobs","items":["Your jobs for today appear as large cards in visit order, showing the customer, site, job type and status.","Navigate opens Google Maps (or Apple Maps on iPhone) with the site address.","Open job takes you into the job to start it, fill in the sheet, add photos and get a signature."]},
    {"heading":"what3words","items":["Where the site has a what3words address it shows under the address as ///word.word.word — tap it to open the exact spot."]},
    {"heading":"Tomorrow and this week","items":["Tomorrow sits collapsed below today''s jobs; tap to expand.","This week shows the rest of the week plus jobs assigned to you that are still awaiting a date."]},
    {"heading":"Talking instead of typing","items":["Notes, comments and free-text boxes have a small microphone button — tap it and speak.","If your browser does not support speech the button simply does not appear."]}
  ]'::jsonb,
  '[
    {"problem":"Navigate is greyed out","solution":"The job has no address or postcode yet — ask the office to add the site address."},
    {"problem":"No microphone button","solution":"Speech input is not supported in that browser; type as normal."}
  ]'::jsonb,
  ARRAY['sync-status','jobs.detail'],
  ARRAY['today','engineer','navigate','what3words','voice','dictation','microphone'],
  ARRAY['src/components/engineer/EngineerTodayHome.tsx']
)
ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, purpose = EXCLUDED.purpose, steps = EXCLUDED.steps,
  common_problems = EXCLUDED.common_problems, related_slugs = EXCLUDED.related_slugs, keywords = EXCLUDED.keywords,
  last_updated = now();