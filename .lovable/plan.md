# Residential sprinkler register and history (BS 9251)

This is a large feature, so I'll build it in three stages. Each stage is usable once it's done. Dry riser behaviour and Viva blue branding stay exactly as they are.

## Stage 1: Register, flats and revisits (items 1, 2, 3, 7)
- **Sprinkler system on the site page:** system type (block / single house / mist or care home), supplies room, tank, pump, panel, a table of zone valves (one row per floor), head make and size, and access notes.
- **Flat / unit list:** quick bulk-add (e.g. 1-83), paste in a list, then edit head count and access notes for each flat. Each flat also shows its last result and the date it was last visited.
- **Revisit list:** flats marked No access or No answer appear on the site page and in Due visits, with a one-tap "Mark visited" that records the date.
- **Reminders:** annual and 6-month visits (single houses annual only), shown in Due visits and Renewals the same way dry risers are. Reminders only; they never book jobs.

## Stage 2: Report and PDF (items 5, 6, 8)
- **Residential Sprinkler Service report:** filled in from the register and last year's flat head counts, with any changes highlighted.
- **Flat checklist:** OK, number of heads, No access / No answer, and a remedial note for each flat.
- **Single house:** plant sections are hidden, so the report fits one page.
- **Open defects:** defects from earlier visits are listed at the top of the report.
- **Raise as defect:** a tick on failed items and per-flat remedials. Each ticked item creates a defect linked to the site and the sprinkler system, with no duplicates.
- **PDF name:** Customer - Site - dd-mm-yyyy - Residential Sprinkler Service.pdf
- **Templates:** check the three BS 9251 templates (Annual Service, 6 Month Inspection, Commissioning). Make sure they are active for Viva and use the register pre-fill.

## Stage 3: QR label (item 4)
- One QR label per site's sprinkler control point, using the same sticker system and the "Leave logo off" tick.
- Scanning it opens the site's sprinkler history: previous reports, remedials, the flat list and no-access flats.

## Also included
- Help guide updates and focused tests for the rules: revisit list, reminder intervals, no duplicate defects, and file naming.

## Technical notes
- **New company-scoped tables:** sprinkler systems, zone valves, units, and unit visit results, with office write access and engineers allowed to record results on their own jobs.
- **QR codes:** these reuse the asset tag system, with the system stored as an asset of type "Sprinkler System", so the existing /r/ link works.
- **Defects:** these reuse the existing trigger pattern (the `_paper_review_defects` style), and no remedials table is added.
