# Dry Riser blank template — unified single-page layout

Goal: stop iterating piecemeal. Word and PDF outputs render from one shared layout source, fit on exactly one A4 page, and are pinned by tests.

## 1. New shared layout module

Create `src/lib/dryRiserLayout.ts` — the single source of truth consumed by both renderers.

Exports (all numeric constants, no rendering logic):

- Page: `pageW=210mm`, `pageH=297mm`, margins `top=10`, `bottom=10`, `left=12`, `right=12` (mm). DXA equivalents for Word: `top=567`, `bottom=567`, `left=680`, `right=680`, plus `pageWdxa=11906`, `pageHdxa=16838`. Content width = `11906 - 680 - 680 = 10546` DXA / 186 mm.
- Header: `logoH=25mm`, `gapLogoToTitle=4pt`, `titleSize=16pt`, `subtitleGap=2pt`, `subtitleSize=10pt`, `ruleGap=2pt`, `ruleThickness=1pt`, `brandBlue=#1F4E79`.
- Footer: `accredStripH=18mm`, `bannerH=8mm`, total footer = `26mm`.
- Body row heights (DXA / mm both exposed): info row `340 / 6mm`, section header `340 / 6mm`, field row `340 / 6mm`, sign-off row `454 / 8mm`. Comments row: `minH=1418 DXA / 25mm`, elastic.
- Colours: `SECTION_HEADER_BLUE = "1F4E79"`, `SECTION_HEADER_FG = "FFFFFF"`.

Helpers:
- `mmToDxa(mm)`, `mmToPt(mm)`, `ptToDxa(pt)`.
- `commentsElasticHeightDxa(usedAboveDxa, footerDxa)` → returns the height the Comments cell must take so the table fills the page exactly (= page content height − header − used rows − sign-off − footer, clamped to `minH`). Both renderers call this so the math is identical.

## 2. Refactor Word generator (`src/lib/wordTemplateBuilder.ts`)

When the template name matches the Dry Riser blank (existing detection path), drive everything through `dryRiserLayout`:

- Page size + margins from config.
- Header: centred logo (25mm), title paragraph spacing-before = 4pt, title 16pt bold blue. Subtitle "BS 9990:2015" 10pt bold blue with 2pt before. Then a paragraph with a 1pt blue bottom border to act as the rule.
- Body table: width = content width DXA from config. Every non-Comments row gets a fixed `TableRowHeight({ value, rule: "exact" })` from config. Comments row uses `rule: "atLeast"` with `commentsElasticHeightDxa(...)` as the value.
- Section header rows: shading `SECTION_HEADER_BLUE`, white bold runs (already partly there).
- Scope of Work row: render only `☑ Pressure Test` (already done — keep).
- PRESSURE TEST RESULTS empty cells: no underline runs (already done — keep).
- Sign-off as a 2-col table directly below Comments.
- Section footer hosts: accreditation logos row (~18mm) then "Tested and inspected in accordance with BS 9990:2015" banner (~8mm). Body bottom margin reserves the footer space.

## 3. Refactor PDF generator (`src/components/BlankTemplatePdfExport.tsx` + `src/lib/pdfHeader.ts`)

- Replace hard-coded margins/header offsets with values from `dryRiserLayout` for the Dry Riser path. Page set via jsPDF `format: "a4"`, margins applied manually as before.
- Header: logo 25mm tall centred, then 4pt gap, title 16pt bold #1F4E79, 2pt gap, subtitle 10pt bold, 2pt gap, 1pt blue rule line across content width.
- Body grid uses same per-row heights and same `commentsElasticHeightDxa` math (converted to mm) so Comments is the only elastic row and the body bottom lands flush with the footer top.
- Footer: accreditation strip (18mm) + banner (8mm) anchored to page bottom regardless of content. Use existing `pdfAccreditations` / banner rendering, just wired to the new constants.
- Single-page guarantee: if the computed `commentsElasticHeightDxa` is below `minH`, throw — caught by the single-page test.

## 4. Tests

All new tests live in `src/test/`.

a. `dryRiserSinglePage.test.ts`
   - Render Word: unzip, count `<w:br w:type="page"/>` and `<w:lastRenderedPageBreak/>` — must be 0. Parse implicit pagination by asserting the body-content height (sum of fixed rows + comments) ≤ page content height.
   - Render PDF via `jsPDF` and assert `doc.getNumberOfPages() === 1`.

b. `dryRiserLayoutParity.test.ts`
   - Import `dryRiserLayout`.
   - Spy / inspect: assert the Word doc's `<w:pgSz>` + `<w:pgMar>` match config DXA values exactly; assert PDF generator's exported `getDryRiserPdfLayout()` (small helper to expose computed numbers) matches the same config in mm.

c. `dryRiserCommentsElastic.test.ts`
   - Inspect every `<w:trHeight>` in the generated Word body table: exactly one row has `w:hRule="atLeast"`, all others `w:hRule="exact"`. The atLeast row corresponds to the Comments row (label cell text `Comments`).

d. Extend `wordSectionHeaderBlue.test.ts` (already exists) — keep current assertions; add a check that the rule colour `1F4E79` and white `FFFFFF` come from `SECTION_HEADER_BLUE` / `SECTION_HEADER_FG` exports of `dryRiserLayout` (import the constant in the test).

e. Extend `wordPdfMarginParity.test.ts` — add a Dry Riser fixture case that asserts `pgMar` = `{top:567,bottom:567,left:680,right:680}` and content width = `10546` DXA, matching `dryRiserLayout`.

## Technical notes

- Margins change from current 10mm-symmetric to 12mm L/R, 10mm T/B — `TABLE_W` for the Dry Riser path becomes `10546` DXA. The existing `wordPdfMarginParity` test expects `TABLE_W = 10772` for the generic path; scope the new constant to the Dry Riser code path only so other templates are unaffected. The generic `TABLE_W` export stays at `10772`.
- `commentsElasticHeightDxa` uses page content height in DXA: `16838 - 567 - 567 = 15704`, minus header block (~25mm logo + ~30pt title chrome ≈ `1700` DXA), minus sum of fixed rows, minus sign-off (`454`), minus footer (`26mm = 1474`). Computed once, used by both renderers.
- PDF uses `jsPDF` mm units already; convert config DXA→mm with `dxa/567*10`.
- No changes to other templates' Word/PDF output.

## Out of scope

- Other blank templates (extinguisher, etc.) keep current behaviour.
- No visual redesign beyond the constraints listed.
