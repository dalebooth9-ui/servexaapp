# Roadmap

- [x] Add permanent UK date/time, job reference, and optional GPS stamps to checklist photos.
- [x] Add the same image-only stamping to general job photo uploads without changing video, audio, or document handling.
- [x] Preserve stamped payloads for any offline queue fallback and update Help & guides.
- [x] Validate focused tests and the preview build.
- [x] Photo tags: tag table, picker, thumbnail badges, filter chips, admin tag settings.
- [x] Photo-linked remedials: create from lightbox, thumbnail in remedials list, spanner badge, auto-tag.
- [x] Before/after ghost overlay on photo checklist items (reference panel, eye toggle, opacity slider, compare view).

- [x] GPS quick capture: auto-file orphan photos to nearest active job (gpsProximity.ts, QuickCapturePhoto FAB, job picker fallback, JobGeocodeSettings batch geocode, jobs.site_latitude/longitude)

- [x] Job timeline activity feed (Timeline tab on job detail: merged feed from activity log, submissions, messages, defects, assignments, documents, checklists, shared galleries; useJobTimeline hook with realtime refresh + Load more)

- [x] On-site document scanner (DocumentScanner with live edge detection, perspective correction, colour/greyscale/B&W, corner adjuster, label + checklist link + tags, saved as document_scan submissions; Scan Document button on job Documents tab and engineer job view)

- [x] Scan Paper Report from the job page (JobScanReportDialog + jobScanReportSave: capture/upload pages, classify-job-sheet-template with manual fallback, runScanExtraction, ScanReviewPanel correction, saves original pages as submissions AND a submitted job_sheet_responses row; prominent button on engineer job view)
- [x] Add a reusable newest-first picker for existing job photos, including WhatsApp images.
- [x] Add view, replace and confirmed remove actions to report and remedial before/after slots.
- [x] Ensure linked/replaced slot photos refresh report data immediately and update Help & guides.
- [x] Verify the engineer flow at phone/tablet sizes and confirm the preview build.

## Auto site photos on online report
- [ ] "Site photos" section on online report + PDF, all job photos in order taken, live updates
- [ ] Per-photo "Include on report" selection (default on); excluded stay on job for office
- [ ] Auto-fill empty before/after slots (first/latest of visit) with "Auto" tag; never overwrite manual
- [ ] PDF: 2-per-row grid with time taken; single-sheet reports keep photos on a separate page
