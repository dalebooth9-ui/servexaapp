insert into public.help_articles (slug, route_pattern, title, purpose, steps, common_problems, related_slugs, keywords, source_paths)
values (
 'voice-dictation', null, 'Voice dictation (talk to type)',
 'Dictate into any free-text box in Servexa instead of typing — useful on site with gloves on.',
 '["Tap into the text box you want to fill in.","Tap the microphone icon on the right-hand side of the box.","Allow microphone access the first time you are asked.","Speak normally — your words appear live and are inserted at the cursor, never replacing what you already typed.","Say punctuation such as \"full stop\" or \"comma\" where you need it.","Tap the microphone again (or tap out of the box) to stop.","Read it back and tidy anything the recogniser got wrong before saving."]'::jsonb,
 '["No microphone icon shown: your browser does not support voice input — use the microphone key on your device keyboard instead.","Microphone blocked: allow microphone access for Servexa in your browser or device settings, or use the keyboard microphone key.","Words missing or wrong: speak a little slower and closer to the device; always check the text before submitting."]'::jsonb,
 array['jobs.detail','site-surveys','paper-scans','rams'],
 array['voice','dictation','speech','microphone','talk to type','hands free'],
 array['src/hooks/useDictation.ts','src/components/ui/dictation-mic.tsx','src/components/ui/textarea.tsx','src/components/ui/input.tsx']
)
on conflict (slug) do update set title=excluded.title, purpose=excluded.purpose, steps=excluded.steps, common_problems=excluded.common_problems, keywords=excluded.keywords, source_paths=excluded.source_paths, last_updated=now();