# Roadmap

## Due Visits Create visit corrections
- [x] A specifically chosen riser is always the only initial tick, including future or already-booked rows; site creation still ticks only overdue unbooked risers.
- [x] The initial type matches the chosen due-visit row (or a unanimous site selection); missing customers have an inline Link a customer action, and both creation actions are disabled with an explanation when no risers are ticked.
- [x] Fourteen focused tests and typecheck pass; Help and memory updated. Signed-in desktop and phone checks verified future Pressure and Visual rows, only the chosen tick, zero-eligible site groups, disabled empty creation and customer-link controls. No jobs or customer links were saved; actual customer-link saving was not exercised against live records. Build OK 11:14 UTC/London.

## Context-specific create-job riser selection
- [x] Sites New job ticks all site risers; Due Visits single-riser creation ticks only that overdue unbooked riser; site creation ticks only overdue unbooked risers. Open-job detection now includes saved job-riser links without requiring a job due date.
- [x] Selection reasons appear above the list; Help and memory updated. Forty-one focused tests pass. Signed-in checks verified four of four ticks from Sites, one overdue tick from single-riser Due Visits, zero ticks for a future riser, and two booked risers excluded while two eligible risers were ticked. No jobs created; build clean.

## Riser report top spacing
- [x] Logo dimensions unchanged; visible logo ink starts at 5mm, SCOPE OF WORK has a 3.5mm visible gap and the QR/Riser ID block shares the top alignment. Transparent logo padding no longer adds page spacing.
- [x] Pressure and Visual 8/10-outlet fixtures and a real downloaded 10-outlet sheet remain one A4 each and were visually checked; Help and memory updated, typecheck/build clean. Physical printing not available.

## Larger riser report logo
- [x] Enlarged centred riser sheet logo 2.5× with right QR, tighter title spacing, print-only pressure/hold row omissions and 8pt body minimum. All four 8/10-outlet Pressure/Visual PDFs remain one A4; rendered sheets visually checked, 18 tests pass, Help updated and build clean. Physical printing not available.

## Sites row actions
- [x] Shared fixed-size main-colour New job and labelled more-actions menus across hierarchy/customer rows; Delete last in red, all row deletion paths show confirmation, icon tooltips added. Help updated; signed-in checks verified menu/tooltips, empty-building confirmation and Cancel causing zero writes, New job opening the form, and customer row controls. Nine existing safety tests pass; build OK 12:47 UTC/London. No records changed.

## Sites performance
- [x] Independent 50-row pages for hierarchy, customers, folder sites and Drag to link; 500ms server name/postcode/customer search, separate true totals, retained loading footprints and stale-response protection. Lazy buildings and duplicate contexts preserve Riverside warnings; destructive checks no longer assume loaded-page completeness. Help updated; nine tests pass. Signed-in live checks verified 50→100 sites, 560-site customer offsets 0→50, independent right-panel search, postcode matches and totals (13 regions/1,601 sites/1,976 buildings/0 zones); no browser errors. Indexed page read verified; build OK 12:45 UTC/London. No data changed.

## Duplicate buildings
- [x] Added admin sibling-name warnings, attached-record preview, fingerprint-confirmed merge with unhandled-link/leftover-link rollback protection and existing audit/undo. All five Riverside flat-range copies verified empty; real buildings left unchanged for confirmation. Desktop/phone previews and stale-request rejection verified; 11 focused tests pass, Help updated, build OK. Successful merge/undo was not exercised because rollback-only database testing lacks staff permissions.

## Shared site job and visit form
- [x] Unify site + and New visit: PO, site customer/duplicate warning, one job type, asset tick list and save/schedule actions.
- [x] Persist exact riser selection atomically; Help updated and 15 tests pass. Signed-in seven-riser site checked desktop/phone; six selected saved as six memberships/drafts and generated six PDF pages; Create and schedule opened the saved job's planner dialog. Temporary test jobs archived, no visits booked. Build checked 12:28 UTC/London; physical printing not tested.

## Generic public asset wording
- [x] Exact hero subheading and QR asset heading/line; generic asset, visit and service-report copy, trades shown as examples; title, description and sharing metadata updated. Buttons, pricing and signed-in app unchanged.
- [x] Help updated; desktop/phone checked with all images loaded, no overflow/runtime errors and working demo enquiry; founder visibility test passes.

## Bold public landing makeover
- [x] Alternating white/navy full-width feature bands, faint navy grid, authentic sample outlet-check capture and sticker output, orange cards/CTAs/stats/standards, tighter spacing; colours/pricing and signed-in app preserved.
- [x] Founder publication disabled; complete public page checked on desktop/phone with all images loaded, no unfinished visible text, no overflow/runtime errors and working demo enquiry. Help updated; capture used fictitious records and no saved data.

## Premium public landing page
- [x] Preserved headline, colours and pricing; authentic demo screenshots in laptop/phone frames, proof strip, five alternating workflow rows, founder/headshot placeholders and simplified standards/footer.
- [x] Compressed CDN imagery, lazy-loaded secondary screenshots, scoped reduced-motion-aware fades; desktop/phone, image delivery and demo enquiry checked with no runtime errors or overflow; Help updated. Logged-in screens unchanged. Site figure and founder quote remain visibly unverified pending Dale’s approved wording.

## Multi-riser site visit job page
- [x] Persisted job riser membership/selection; split job/site riser sections, count and shared per-riser report/sticker defaults.
- [x] New site jobs default to active risers; targeted scan/explicit visit paths preserved. Duplicate warnings require site/riser/type.
- [x] Admin/company-scoped merge preview/confirmation with fingerprint, preservation snapshot, transactional reference moves, conflict blocking and source archival.
- [x] Help updated; 29 tests pass, real example page and merge preview checked desktop/phone; temporary jobs verified four-riser defaults/four print rows and successful merge/history preservation, then archived. Real example jobs untouched. Physical printing, full engineer/second-tenant browser sessions and conflict/stale-preview integration tests not exercised.

## Sticker-only Viva logo and larger QR
- [x] Exact original Viva logo cropped without tagline for stickers only; enlarged logo/number and 20mm QR, retaining L4778 grid and plain customer labels across the shared print entry points.
- [x] Eleven tests pass; branded/plain PDFs rendered in the browser and branded labels visually checked; Help updated. Ready at 11:15 UTC/London. Physical printing not tested; no build log available in this sandbox.

## Permanent outlet QR codes
- [x] Automatically save missing dry/wet outlet codes on creation/count changes; retain removed outlets as No longer fitted and preserve existing identities.
- [x] Backfilled Viva Fire: 5,344 unique codes created, zero missing outlets or inlet collisions; other companies unchanged. Both pickers ensure codes before listing; Help updated.
- [x] Sixteen tests pass; signed-in eight-outlet asset picker shows nine labels on desktop/phone, outlet rows load and report code lookup returns all eight. Asset map link added; site/job links already present. Latest build 11:10 UTC/London clean. Physical camera scan/printing and job picker walkthrough unavailable: no current-company job linked to an eight-outlet site in the checked database.

## Riser QR label reprinting
- [x] Add existing-code-only riser/site picker, per-label preview and reprint controls, outlet QR rows and immutable office history.
- [x] Preserve fitted QR identities, company branding and admin isolation; Digital Twin off confirmed on real asset; Help updated, 22 tests pass. Real inlet 6NDDM4 PDF downloaded and Reprinted history read back; single-label and phone controls verified. No saved outlet tags exist, so outlet reprints show missing codes rather than inventing them; physical printing and independent second-company/engineer sessions not exercised.

## Digital Twin visibility
- [x] Add default-off company setting under Advanced, admin-only writes using verified company-scoped app_settings RLS; gate asset sensor UI and maintenance alerts.
- [x] Remove public sensor claims; update Help and shortcuts. 19 tests pass; Dale's real asset and admin enable/disable read-back verified, left OFF; desktop/phone checked. Independent engineer/second-company sessions not exercised; role/company rules covered by tests and existing server policies.

## App-wide pinned address links
- [x] Add shared safe map/search, mobile directions and copy-address controls with precise saved locations; deployed and verified what3words coordinate lookup.
- [x] Replace pinned address displays across office, engineer, planner and customer views; update Help. Quote screens have no pinned address displays; printable documents unchanged.
- [x] Eleven focused tests pass; signed-in map/directions URLs, clipboard, job link and phone wrapping verified without data changes; native installed maps-app launch requires a physical device.

## Clickable Sites summaries
- [x] Add summary lists, region drill-down, filtered counts, Clear and zone creation shortcut without changing site records.
- [x] Update Sites Help; five tests pass; Dale's desktop/phone lists, Riddell search, region drill-down, Clear and zone form verified without saving records.

## Safe asset duplicate review
- [x] Count tenant duplicate groups and trace creation paths: 20 groups / 25 extra assets, four evidenced CSV imports (case-insensitive review).
- [x] Add admin-only preview/confirmed merge preserving linked records and old QR tags; source assets retained as hidden aliases with full merge snapshots.
- [x] Prevent repeated imports/builds and correct paginated asset counts; deploy commit-import.
- [x] Update Help; 25 tests pass and Dale's signed-in Riddell Court preview/cancel checked with 17 history records.
- [ ] Successful confirmed merge and physical old-sticker scan: no live cleanup performed without the user's reviewed confirmation; no physical scanner available.

## Exact assistant shortcuts
- [x] Share tool destinations between help answers and navigation; link tool names and Go to buttons.
- [x] Reveal tabs/collapsed sections, scroll and briefly highlight without executing tools.
- [x] Update Help; 15 destination/safety tests pass; signed-in real assistant inline jump and desktop/phone reveal/highlight checked. Existing company access rules unchanged; no company data modified.

## CSV customer clean-up
- [x] Add admin-only removal/merge CSV previews, safe confirmation and downloadable results.
- [x] Enforce tenant ownership, protected customer and no-data removal; preserve linked records and archive complete merged contacts.
- [x] Update Help; 13 rule tests pass; signed-in previews and confirmation checked on desktop/small screen; server skips data-bearing customers and rejects protected/foreign customers.
- [ ] Execute an actual empty-customer removal and duplicate merge from the supplied lists — the two CSV lists were not attached; no real customer was removed or merged for testing.

## Restore job report printing
- [x] Restore Print reports beside Print sticker pack using the unchanged per-riser paperwork generator; update Help. 20 focused tests pass and preview builds cleanly; isolated visit-data rendering verified without writes. No actual visit-sheet rows are available in this preview, so real visit printing remains unverified.

## Riser sticker and scan service fixes
- [x] Pin full cropped sticker logo at 20mm/8mm maximum height and QR at 16.2mm; preserve label grid, plain stickers and first-free start position.
- [x] Reuse eligible riser visits or one site/day scan job transactionally; select existing/default report and record attendance in the org-scoped job activity log.
- [x] Open the exact riser response in engineer view; persisted signed submission returns to its refreshed report list; scan fields exclude finance/PO and bypass template auto-attach.
- [x] Update Help and rules; 37 tests pass and preview builds cleanly. Assigned Dale account/tablet scans repeatedly reuse VFP-00264 and response 3b5c696f-c0a5-4d54-a126-1f815168023d; no new job created; sticker PDF inspected.
- [ ] Submit a real report, concurrent fallback job creation and physical label scan/print — not exercised to avoid fabricating live report/signatures; no physical label sheet/scanner available. Account used also has admin rights; pure engineer server permissions not independently exercised.
- [ ] Wet visual fallback — this company has no published Wet Riser visual template; action fails clearly without creating a partial job rather than inventing a safety template.

## Printed paperwork polish
- [x] Align shared PDF/Word body text, print-only name casing and readable last-inspection details.
- [x] Remove blank-answer rules, retain signing lines and wrap dry/wet questions without clipping.
- [x] Resolve coloured watermarks and section styling within the generating company; update Help; 94 focused tests pass and preview builds cleanly.
- [x] Signed-in VFP-00264 PDF and Word downloads verified: four risers/four pages, full air-release question, readable history, clean boxes, logo/QR/badges retained; Word also rendered through LibreOffice.
- [ ] Physical printing and Microsoft Word rendering — no printer or Microsoft Word available; LibreOffice's importer emits compatibility warnings, so its font substitution is not proof of Microsoft Word appearance.

## Email Triage and renewal email repairs
- [x] Diagnose missing extensions.http_post, nonexistent interval relationship and missing renewal template; no test sends.
- [x] Make triage notifications best-effort/company-scoped via authenticated bridge; renewal admin checks, dry-run and failure logs.
- [x] Add Settings email health, update Help; four focused tests pass; signed-in renewal manual/automatic dry runs and anonymous rejection verified.
- [x] Preserve all automation settings; send/reminder logs remain zero after tests.
- [ ] Failed Email Triage sender/subject/date list — no triage inbox or inbound email rows exist in Servexa and no accessible Email Triage connection was found; source mailbox records needed.
- [ ] Real queue delivery and job creation with failed notification — intentionally not exercised against live data to avoid real emails; sender DNS verification has timed out.

## Recent-feature company isolation audit
- [x] Audit site access, due/new visits, logo storage, site merge/undo, import matching, asset tags and printable branding against live permissions.
- [x] Fix company-boundary gaps: linked-record guards, child merge/undo scoping, per-company sticker uniqueness, staff-only imported history, private logo reads, server-validated import parents and session-safe print branding.
- [x] Verify live foreign-company reads return zero and access save, merge, report sync and import reject foreign IDs; 57 tests pass; Due visits and Besseges logo verified; update Help.
- [x] Summarise findings, fixes and verification limits; no decisions required to enforce company isolation.
- [ ] Independent engineer/customer sessions, successful merge/undo and new visits in two companies, duplicate-tag insert and physical prints — no approved independent test sessions/printer; do not create, delete or alter live customer data for testing.

## Customer logo loading repair
- [x] Audit all nine saved customer logos without altering customer records; all signed links return usable images.
- [x] Restore logo read policy and company-admin writes, including print-logo uploads.
- [x] Repair signed-in displays and shared PDF/Word header fallback; retain flame watermark with saved colour or neutral grey.
- [x] Update Help; 38 tests pass and Besseges logo verified on its customer page and both shared-header PDF sample pages.
- [x] Keep legacy public links unavailable — superseded by the company-isolation requirement; private signed-in logo loading is retained.
- [ ] Physical printing and every live printable variant — no printer available; shared header sample and existing parity tests verified.

## Site access information
- [x] Add staff-only site access storage, confirmation and immutable change history.
- [x] Add site card, engineer completion editing, QR visibility and report-field Save to site file.
- [x] Add engineer-only PDF/Word access boxes, cabinet key prefill and default-on/masked print setting.
- [x] Update Help, add printing/privacy rule tests and verify office saving/history and access PDF.
- [ ] Pure-engineer completion/QR and physical printing — no pure-engineer session or printer available.

## Printable logos and customer print branding
- [x] Restore every-page header logos without changing report fields or boxes.
- [x] Add opt-in customer print logo, brand colour and switch; use Besseges' existing saved logo and colour.
- [x] Apply shared branding to printable PDF/Word, visit sheets, reports and certificates.
- [x] Keep prices/costs off printables and PO office-only; update Help and verify exports.
- [ ] Physical print and pure-engineer tablet verification — no printer available; Dale's account also has admin access.

## New dry-riser visits and due reminders
- [x] Plan reuse of existing site jobs, per-riser templates, paperwork and reminders.
- [x] Add office New visit flow with one job and selected-riser sheets.
- [x] Add per-riser blank PDF/print/Word paperwork and matched digital prefills.
- [x] Add office Due visits, dashboard card, snooze/lost/restore and no-longer-serviced controls.
- [x] Add reminder settings; user chose in-app reminders only, no weekly digest.
- [x] Update Help & guides and verify rules, office creation, seven-page downloads and engineer-view tablet sheets.
- [ ] Pure engineer permission check and physical printing — Dale's account also has admin access; no physical printer available.

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
- [x] "Site photos" section on online report + PDF, all job photos in order taken, live updates
- [x] Per-photo "Include on report" selection (default on); excluded stay on job for office
- [x] Auto-fill empty before/after slots (first/latest of visit) with "Auto" tag; never overwrite manual
- [x] PDF: 2-per-row grid with time taken; single-sheet reports keep photos on a separate page

## Dry riser pressure → visual switch
- [x] Switch button + reason, data kept both ways, PDF notice, office tag/return visit/invoice warning, timeline log

## Weekly planner grid
- [x] Fixed one-cell-per-day cards, multi-day day counters, compact overflow and full-detail hover.
- [x] Pointer-aligned drop targets and planner guide update.

## Multiple systems per job
- [x] Engineer list shows every report (one per system) with "System N of M", Not started / In progress / Done, "X of M done"
- [x] Craven House: 3 Visual Inspections = Systems 1–3; 3 empty old pressure tests set aside (not deleted)
- [ ] Editable system labels; add/remove a report on site; quantity change never deletes filled reports
- [ ] "How many systems?" box on every job-creation path; PO/scan without clear number → 1 + "Check quantity" flag
- [ ] Completion reason when reports not done (no access / not on site / other), shown to office
- [ ] Help guide update
## Switched visual report customer PDF
- [x] Remove switch reason banner from customer PDFs without a layout gap.
- [x] Use Dry Riser Visual Inspection for scope, title/header, filename and email subject.
- [x] Keep switch reason and internal note available to office screens.
- [x] Verify the completed Craven House report visually and keep its main report to one page.
- [x] Update Help & guides.

## Engineer completion with unused reports
- [x] Untouched reports never block completion and are retained as Not used.
- [x] Started unfinished reports use one Complete anyway confirmation.
- [x] Customer output contains only submitted reports.
- [x] Reports to check shows the submitted-report ratio.
- [x] Update Help & guides and verify the engineer-only tablet layout/session.
- [ ] Run both completion scenarios end to end — blocked because the available demo engineer has no assigned multi-report test jobs, and live engineer records must not be altered.

## Full written report entry
- [x] Remove per-report write-up actions from completed and scanned report rows.
- [x] Add one shared Extra section with optional multi-report comment selection and existing Site Visit Reports.
- [x] Distinguish duplicate completed reports by system label or riser location.
- [x] Update Help & guides.
- [ ] Verify office and engineer layouts.


## Print template linked to job type
- [x] Run Print reports and Print sticker pack as Test Fire Co on its own site/risers/job: two-page service sheet (one per riser) and a two-sticker sheet, both showing only Test Fire Co wording with no logo (none saved), no Viva text, flame watermark or accreditation badges; Settings > Documents shows its job type linked to its own template; Last printed note appears after printing.

## PO job type detection
- [x] PO intake picks job type from company's own job categories (uncertain -> blank "Needs a type"; extra work types as note)
- [x] Pending job review: type dropdown + "Suggested from PO" / "Needs a type"
- [x] Job page: change type any time; activity log; "Job type changed. Reprint reports?" prompt if printed

## Printed Customer/Site Details wording
- [x] Print customer, then site name, then site address on separate lines; an address that only repeats the site name is left out and the postcode prints once — one shared rule in src/lib/siteDetailsPrint.ts used by paper sheets, Word documents and PDF headers.
- [x] Update Help & guides (job page guide) and the AGENTS print rule; 9 new tests pass, the full suite's 23 pre-existing failures are unchanged, build clean; three sample sheets rendered and inspected.
- [ ] Physical printing — no printer available.
