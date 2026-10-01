
- Live (non-scanned) report PDFs load signatures via authenticated storage download, wait for in-flight signature saves, and refuse to render (logging `signature_missing_on_pdf`) if a saved signature can't load — why: silent unsigned PDFs reached customers.
- The service-worker storage cache never stores opaque responses — why: opaque copies broke later CORS image loads in PDF generators.
- Before/after slots store durable storage references and link existing job photos without copying or deleting the source — why: slot changes must update reports immediately while preserving the job photo library.
- Report site photos: selection is stored per report as `_site_photo_excluded` (normalised storage-path keys) and photos render on separate pages after the sign-off — why: keeps single-sheet reports on one page and matches every photo source.
- Wet/visual report switching keeps one response row, changes only template_id and stores `_mode_switch` in the answers; pairs live in `src/lib/reportModeSwitch.ts` — why: no data loss on switch/back and new pairs need only a config entry.
