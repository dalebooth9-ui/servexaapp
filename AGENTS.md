
- Live (non-scanned) report PDFs load signatures via authenticated storage download, wait for in-flight signature saves, and refuse to render (logging `signature_missing_on_pdf`) if a saved signature can't load — why: silent unsigned PDFs reached customers.
- The service-worker storage cache never stores opaque responses — why: opaque copies broke later CORS image loads in PDF generators.
- Before/after slots store durable storage references and link existing job photos without copying or deleting the source — why: slot changes must update reports immediately while preserving the job photo library.
- Report site photos: selection is stored per report as `_site_photo_excluded` (normalised storage-path keys) and photos render on separate pages after the sign-off — why: keeps single-sheet reports on one page and matches every photo source.
- Wet/visual report switching keeps one response row, changes only template_id and stores `_mode_switch` in the answers; pairs live in `src/lib/reportModeSwitch.ts` — why: no data loss on switch/back and new pairs need only a config entry.

- Site Visit Reports live in `site_visit_reports` (not job sheet templates); photos link existing job photos via `site_visit_report_photos` (durable storage_ref + stable finding_id) — why: written reports differ from checklists and photos must not shift between findings.
- Site Visit Reports are created immediately on open (prefilled by `src/lib/siteVisitReportPrefill.ts`) and autosave to the row plus an `autosave_svr_<id>` local copy — why: drafts survive signal loss and closed tabs.
- Site Visit Report approval/unlock go through security-definer RPCs (approve_site_visit_report / unlock_site_visit_report) guarded by a trigger; approval raises defects for 'us' recommendations and stores defect_id on the recommendation — why: only office approves, locks are server-enforced, and defects are never duplicated.
- Site Visit Report PDFs are built client-side in src/lib/siteVisitReportPdf.ts (shared renderPdfHeader, org logo/brand colour, red brand colours fall back to blue); approved PDFs are filed as job_documents (storage:// ref, shareable) and portal users open them via the portal-document-url function — why: no existing template changes and portal users have no direct storage access.
- The 'new version' banner's Update now drops the app service worker before reloading (reloadToLatest in src/pwa/registerSW.ts) — why: a plain reload is answered by a stale worker's cached page, leaving devices stuck on old builds.

- Weekly planner renders one fixed droppable cell per engineer/date and uses pointer-position collisions for visit moves; cards remain per-day even for multi-day jobs — why: spanning zones and centre-based collisions displaced drop targets.
- The app service worker uses prompt mode and the page never reloads itself; the update notice shows once per deployed version, only on dashboard/job list — why: auto-reloads wiped engineers' in-progress reports.
- Open job-sheet forms persist per job (`open_form_<jobId>`) and flush drafts on pagehide/hidden — why: a reload must return to the same report with answers.
