# P6 Audit — Header chrome (read-only)

None of the five audited generators call `renderPdfHeader` from `src/lib/pdfHeader.ts`. Each draws its own header inline. Below: what each one draws, the coordinates it uses, and how it diverges from `renderPdfHeader`.

For reference, `renderPdfHeader` (the shared helper used by `BlankTemplatePdfExport`, `JobSheetPdfExport`, `ScanJobSheet`, `CustomerReportPdf`) draws:
- Logo centred, top y=8 (or 6 compact), logoMaxW=85 / logoMaxH=40 (65/28 compact); fallback = company name text.
- Title (uppercase template name), bold helvetica 15, accent (brand-extracted or default navy `[33,61,99]`), centred.
- Optional standard subtitle, bold 9, accent.
- Full-width separator line at margin→pageWidth-margin, draw colour = accent, lineWidth 0.5.
- 3- or 4-row detail grid: `margin=10`, rowHeight=6, split column at 70% width — Customer/Date, Site/PO-REF, Riser Location, optional what3words.

---

## 1. `src/lib/pdfHeader.ts` (the baseline)

Already described above. The reference implementation. (No divergence from itself.)

---

## 2. `src/components/JobPdfReport.tsx` (lines ~178–227)

**(a) Draws:** centred logo → "JOB REPORT" title (uppercase) → reference + "Generated <date>" subtitle → coloured separator. No detail grid (job details rendered separately below).

**(b) Coordinates:**
- `margin = PDF_DIMENSIONS.margin` (10), `pageWidth = doc.internal.pageSize.getWidth()`.
- Logo: top y=8, `logoMaxH=20`, `logoMaxW=70`, centred via `(pageWidth-logoW)/2`. Format auto-detected from data URL mime.
- `logoBottomY = 8 + logoH + 3`.
- Title: `helvetica bold 16`, colour `(33,61,99)`, centred at `logoBottomY`.
- Subtitle: `helvetica normal 10`, colour `(100,100,100)`, centred at `logoBottomY + 6`. Text: `${reference_number}  |  Generated <dd/mm/yyyy>`.
- Separator: drawColor `(33,61,99)`, lineWidth 0.5, from `(margin, logoBottomY+8)` to `(pageWidth-margin, logoBottomY+8)`.
- Body resumes at `y = logoBottomY + 13`.

**(c) Differs from renderPdfHeader:**
- Logo sized 20×70mm (helper: 40×85mm, or 28×65mm compact) — visibly smaller.
- Title font 16 vs helper's 15.
- Hard-codes navy `(33,61,99)` instead of accepting an accent/brand colour.
- Adds a centred subtitle line ("REF | Generated DATE") which the helper does not produce.
- No optional "standard" (BS-number) line.
- No detail grid (Customer/Site/PO-REF/Riser); drawn separately later in the file.
- No company-name text fallback when logo fails.

---

## 3. `src/components/CertificateOfConformity.tsx` (lines ~459–515)

**(a) Draws:** top-right Viva logo → three stacked grey title bands ("System Type", "Certificate of Conformity", "Certificate Number …"). No detail grid in the header proper.

**(b) Coordinates:**
- `ML = MR = PDF_DIMENSIONS.margin` (10), `contentW = pw - ML - MR`.
- Logo: fixed `52 × 20mm`, drawn at `(pw - MR - 52, 10)` (top-right), JPEG forced.
- Title bands start at `y = 38`. Each band: fill `PDF_PALETTE.headerStrip` (#D9D9D9), `bandH=9`, full `contentW`.
- Band text: `helvetica bolditalic`, colour `(30,30,30)`, centred at `(pw/2, y+6.2)`.
  - Band 1: systemTypeTitle, fontSize 12.
  - Band 2: "Certificate of Conformity", fontSize 14.
  - Band 3: "Certificate Number <n>", fontSize 12.
- `bandGap = 2mm` between bands. After last band: `y += 8`.

**(c) Differs from renderPdfHeader:**
- Logo is right-aligned and fixed-size; helper centres logo and scales by aspect.
- No customer-logo support — always hard-codes `/images/vivafire-logo-new.jpg`.
- Replaces helper's title + standard line with a stack of three grey-fill bands, italic style, much heavier visual treatment.
- Uses `PDF_PALETTE.headerStrip`, not the navy/accent colour.
- No separator line, no detail grid, no W3W row.
- Body content (BUILDING / Client / Date) is drawn after the bands rather than in a structured grid.

---

## 4. `src/components/PreStartChecklistPdf.tsx` (lines ~58–95)

**(a) Draws:** centred customer-or-Viva logo → navy title bar with white "DRY RISER SYSTEM — PRE-START CHECK LIST" → dark sub-band "WET & DRY RISER SPECIALISTS" → contract-no/contract-name 2-cell row → optional site-address row.

**(b) Coordinates:**
- `ml = PDF_DIMENSIONS.margin` (10), `mr = pw - margin`, `cw = mr - ml`.
- Logo: drawn at `(pw/2 - 28, 8)`, fixed `56 × 20mm`. Format inferred from URL extension (`.png` → PNG else JPEG). Falls back silently on error.
- `y` starts at 32 after logo block.
- Title bar: fill `PDF_PALETTE.navy`, `rect(ml, y, cw, 11)`, white `helvetica bold 13`, centred at `y+7.2`. Then `y += 11`.
- Sub-band: fill `PDF_PALETTE.inkDark`, `rect(ml, y, cw, 4.5)`, white `helvetica bold 7.5`, centred at `y+3.2`. Then `y += 4.5 + 4`.
- Contract row: two `halfW`-wide cells, fill `PDF_PALETTE.zebra`, height `rowH=9`. Micro labels (`helvetica bold 7`, muted) at `y+3.2`; values (`helvetica bold 9`, dark) at `y+7.5`.
- Optional site-address row: zebra fill, `rect(ml, y, cw, 7)`, micro "SITE" label + value text starting at `ml+16`, height `max(7, lines*4 + 2)`.

**(c) Differs from renderPdfHeader:**
- No template-name title; instead a hard-coded navy banner specific to "DRY RISER SYSTEM — PRE-START CHECK LIST" plus a dark sub-band.
- Uses navy fill bands (filled rectangles with white text), not a single accent-coloured separator line.
- Logo box uses a fixed `56 × 20mm` (vs helper's aspect-fit 85×40).
- Detail grid rolled by hand (Contract No / Contract Name / Site row) instead of helper's standard 70/30 split with Customer/Date/Site/PO-REF/Riser/W3W.
- No accent/brand-colour parameter; navy is locked to `PDF_PALETTE.navy`.
- No standard (BS) subtitle line.

---

## 5. `src/lib/ramsPdfBase.ts` — `pageHeader()` running header (lines 124–154)

**(a) Draws (per non-cover page):** small left logo → right-aligned subtitle ("Method Statement & Risk Assessment" or caller-supplied) → small right-aligned "VIVA Fire Protection Ltd" line → horizontal rule. No detail grid (cover page handles that separately).

**(b) Coordinates:**
- `ML`/`MR` are the RAMS module's own margin constants (not `PDF_DIMENSIONS.margin`).
- Logo: at `(ML, y)`, `lh=14`, `lw = min(14*aspect, 50)`, JPEG forced. If null: `helvetica bold 11` navy `(33,61,99)` "VIVA FIRE PROTECTION LTD" at `(ML, y+8)`.
- Subtitle: `helvetica bold 8.5` navy `(33,61,99)`, right-aligned at `(PAGE_W - MR, y + 6)`.
- Tagline: `helvetica normal 8`, right-aligned "VIVA Fire Protection Ltd" at `(PAGE_W - MR, y + 11)`.
- Horizontal rule via `hr(doc, y + 17, 60)` (grey ~60% line).
- Returns `y + 21` (next-content cursor).

**(c) Differs from renderPdfHeader:**
- Layout is **left-logo + right-text**, not centred logo + centred title.
- Logo size 14×≤50mm — much smaller than helper's 40×85.
- No template-name title and no detail grid; the header is a thin running band, not a page chrome.
- Hard-codes the "VIVA Fire Protection Ltd" right-side caption; no customer branding considered.
- Always hard-codes navy `(33,61,99)`; no accent/brand override.
- Uses RAMS-local `ML`/`MR` and `hr()` helper instead of helper's direct `doc.line` from `margin` to `pageWidth-margin`.
- Forces JPEG format regardless of source.

---

## 6. `src/lib/ramsPdf.ts` (cover page header — `buildCoverPage` in `ramsPdfBase.ts` lines 391–454)

`ramsPdf.ts` itself does not draw the cover header inline; it delegates to `buildCoverPage()` in `ramsPdfBase.ts`. Including it here for completeness.

**(a) Draws:** centred multi-line title stack — `opts.title1` / "VIVA FIRE" / "Method Statement & Risk Assessment" / "Fire Protection Ltd" / `opts.title2` — followed by an `hr()` rule. **No logo.** Subsequent block adds a contract/client/site/engineer detail box.

**(b) Coordinates:**
- `y = 20` start.
- All centred at `PAGE_W / 2`, navy `(33,61,99)`, `helvetica bold`:
  - `title1` — fontSize 16 at y=20; then `y += 8`.
  - "VIVA FIRE" — fontSize 22; then `y += 8`.
  - "Method Statement & Risk Assessment" — fontSize 13; then `y += 7`.
  - "Fire Protection Ltd" — fontSize 14; then `y += 7`.
  - `title2` — fontSize 13; then `y += 12`.
- `hr(doc, y, 60)` then `y += 8`.
- Detail box: drawn separately further down (rectangle of `CONTENT_W`, contains contract/client/site/engineers/review-text rows).

**(c) Differs from renderPdfHeader:**
- No logo at all on the cover (relies on the wordmark-style "VIVA FIRE" text instead).
- Title is a 5-line stacked masthead, not a single bold uppercase line.
- Uses font sizes 13–22 vs helper's single 15 + optional 9.
- Always navy; no brand accent override.
- Detail box is drawn as one rectangle with bold-label / normal-value rows at fixed offsets, not as the helper's 3-row grid with a 70/30 split column line.
- Uses RAMS-local `ML`/`MR`/`CONTENT_W`/`hr()` rather than the helper's direct margin/`doc.line` calls.

---

## Summary table

| File | Logo | Title style | Detail grid | Accent/brand | Uses helper? |
|---|---|---|---|---|---|
| `pdfHeader.ts` (baseline) | Centred, 40×85 | Centred bold 15 + opt standard | 3–4 row 70/30 split | Accepts `accentColor` | — |
| `JobPdfReport.tsx` | Centred, 20×70 | Centred bold 16 + ref/date subtitle | None (later) | Hard navy | No |
| `CertificateOfConformity.tsx` | Top-right, 52×20 fixed | 3 grey bands (12/14/12, italic) | None | Headerstrip grey | No |
| `PreStartChecklistPdf.tsx` | Centred, 56×20 fixed | Navy banner + dark sub-band | Custom 2-cell + site row | Hard navy | No |
| `ramsPdfBase.pageHeader` | Left, 14×≤50 | Right-aligned subtitle, no title | None | Hard navy | No |
| `ramsPdfBase.buildCoverPage` | None | 5-line centred wordmark stack | Separate boxed grid | Hard navy | No |

Key common divergences:
1. None call the shared helper.
2. None accept/use a brand-extracted accent colour.
3. Logo sizing varies: 14, 20, 20, 20, 0 vs helper's 40 (28 compact).
4. Only the helper produces the standardised Customer/Site/PO-REF/Riser/W3W detail grid.
