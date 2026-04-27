## Audit — Background Fill Palette (Data Rows)

### Every fill colour found, grouped by intent

| Intent | RGB | Hex | Where it appears |
|---|---|---|---|
| **Section header — dark navy** | `33, 61, 99` | `#213D63` | `JobPdfReport.tsx:56` (section title bar), `ramsPdf.ts:975` (page-break header), shared brand navy |
| **Section header — bright "navy"** | `30, 174, 232` | `#1EAEE8` | `PreStartChecklistPdf.tsx:68` (`VIVA_NAVY`) — **NOT navy, it's cyan/sky-blue** |
| **Section header — text accent** | `33, 37, 41` | `#212529` | `PreStartChecklistPdf.tsx:69` (`VIVA_DARK`) |
| **Section header — mid grey** | `217, 217, 217` | `#D9D9D9` | `pdfBody.ts:418` (`renderSectionHeader` default) |
| **Section header — handfill grey** | `235, 235, 235` | `#EBEBEB` | `pdfBody.ts:405` (handfill mode) |
| **Table header strip** | `230, 230, 230` | `#E6E6E6` | `ramsPdfBase.ts:576`, `ramsPdf.ts:934` (operative-signature column headers) |
| **Zebra row — neutral** | `248, 248, 248` | `#F8F8F8` | `PreStartChecklistPdf.tsx:99,124` (contract & site rows) |
| **Zebra row — tinted** | `230, 245, 252` | `#E6F5FC` | `PreStartChecklistPdf.tsx:181,202` (`VIVA_NAVY_TINT`) |
| **Zebra row — pale slate** | `245, 247, 250` | `#F5F7FA` | `CustomerReportPdf.tsx:175,331` |
| **Zebra row — light grey** | `240, 240, 240` | `#F0F0F0` | `CustomerReportPdf.tsx:251` |
| **Title band — mid grey** | `210, 210, 210` | `#D2D2D2` | `CertificateOfConformity.tsx:493` (CoC title bands) |
| **Pure white reset** | `255, 255, 255` | `#FFFFFF` | `CertificateOfConformity.tsx:624` |
| **Cell fills (RAMS opt)** | caller-supplied `opts.fill` | varies | `ramsPdf.ts:172`, `ramsPdfBase.ts:193` (boxed cells) |
| **Risk-rating cell** | caller-supplied `item.r/g/b` | varies | `ramsPdf.ts:287`, `ramsPdfBase.ts:313` (red/amber/green legend) |

### Findings

#### 1. The "navy" name collision is real and is shipping
`JobPdfReport`, `RAMS`, and `pdfBranding` all treat `[33, 61, 99]` (dark blue `#213D63`) as the brand navy. `PreStartChecklistPdf.tsx` declares `VIVA_NAVY = [30, 174, 232]` — which is a **bright cyan**, completely different colour. So the Pre-Start checklist's section bars don't match any other document's section bars. **This is a bug, not a stylistic choice.**

#### 2. Five different greys for "header strip"
`#D9D9D9`, `#EBEBEB`, `#E6E6E6`, `#D2D2D2`, plus the cyan above. All used for the same conceptual element (a band that visually anchors the rows below). No central token.

#### 3. Four different greys for "alternating row tint"
`#F8F8F8`, `#E6F5FC`, `#F5F7FA`, `#F0F0F0`. Each generator picked its own. The shared `renderFilledFieldRow` in `pdfBody.ts` doesn't tint at all, so JobSheet / Blank / Scan render flat white rows while CustomerReport and PreStart get zebra-striping.

#### 4. CertificateOfConformity uses a totally separate palette
`#D2D2D2` for the three title bands. Doesn't appear anywhere else in the codebase. Harmless but unowned.

#### 5. Local colour-token definitions (not shared)
`PreStartChecklistPdf.tsx` declares `VIVA_NAVY / VIVA_DARK / VIVA_GREY / VIVA_BORDER / VIVA_NAVY_TINT` **inside the function body**. None of those tokens are exported. Every other generator hard-codes literals.

#### 6. No connection to the dynamic branding engine
The `mem://features/servexa-reports` rule says PDFs should theme from extracted brand colours, but every fill above is a static literal — only `JobSheetPdfExport` / `BlankTemplatePdfExport` / `CustomerReportPdf` consult the branding object for header tints. RAMS, CoC, JobPdfReport, and PreStart ignore branding entirely on row backgrounds.

---

## Proposed Consolidation Plan

### 1. New module `src/lib/pdfPalette.ts`
Single export of every named fill the document system is allowed to use:

```ts
export const PDF_PALETTE = {
  // Brand
  navy:        [33, 61, 99]   as [number, number, number], // #213D63
  navyText:    [255, 255, 255] as [number, number, number],

  // Section / table headers
  headerStrip: [217, 217, 217] as [number, number, number], // #D9D9D9
  headerSoft:  [235, 235, 235] as [number, number, number], // handfill mode

  // Zebra row tint
  zebra:       [248, 248, 248] as [number, number, number], // #F8F8F8

  // Borders
  border:      [180, 180, 180] as [number, number, number],
  borderSoft:  [220, 220, 220] as [number, number, number],

  // Text
  ink:         [30, 30, 30]    as [number, number, number],
  inkMuted:    [110, 117, 125] as [number, number, number],
  white:       [255, 255, 255] as [number, number, number],
} as const;
```

Plus a small helper for branding override:
```ts
export function brandedNavy(branding?: BrandingTokens): [number, number, number] {
  return branding?.primary ?? PDF_PALETTE.navy;
}
```

### 2. Migrate generators

| Generator | Action |
|---|---|
| `pdfBody.ts` | Replace `217,217,217` and `235,235,235` literals with `PDF_PALETTE.headerStrip / headerSoft`. |
| `ramsPdfBase.ts` & `ramsPdf.ts` | Replace `230,230,230` (header strip), `33,61,99` (page-break header) with palette tokens. |
| `JobPdfReport.tsx` | Replace `33,61,99` with `brandedNavy(branding)` so the section title band themes per customer like the other reports already do. |
| `PreStartChecklistPdf.tsx` | **Bug fix:** replace the `VIVA_NAVY = [30,174,232]` cyan with `brandedNavy(branding)` so checklist section bars match the rest of the platform. Replace `VIVA_NAVY_TINT` (`#E6F5FC`) and the loose `[248,248,248]` with `PDF_PALETTE.zebra` for one consistent zebra. Replace `VIVA_BORDER` with `PDF_PALETTE.border`. Delete the local token block. |
| `CustomerReportPdf.tsx` | Collapse the three local greys (`#F5F7FA`, `#F0F0F0`) into `PDF_PALETTE.zebra` and `PDF_PALETTE.headerStrip`. |
| `CertificateOfConformity.tsx` | Replace `#D2D2D2` title-band fill with `PDF_PALETTE.headerStrip` so CoC bands match every other "header strip" in the system. The white reset stays as `PDF_PALETTE.white`. |

### 3. Wire zebra into the shared row helper
Once `pdfRows.ts` exists (from the previous data-row plan), `drawFieldRow` reads `PDF_PALETTE.zebra` when the caller passes `zebra: true`. JobSheet / Blank / Scan get zebra-striping for free without touching their call sites.

### 4. What stays bespoke (intentionally)
- **RAMS risk-rating cells** (`ramsPdf.ts:287`) — caller-supplied `r,g,b` is correct: those are red/amber/green legend cells, not chrome.
- **RAMS boxed cells** with `opts.fill` — caller-supplied is correct.
- **Brand-overridable navy** — keep it as a function call, not a constant, so per-customer branding still wins.

---

## Files Touched

**New:** `src/lib/pdfPalette.ts`

**Modified:** `src/lib/pdfBody.ts`, `src/lib/ramsPdf.ts`, `src/lib/ramsPdfBase.ts`, `src/components/JobPdfReport.tsx`, `src/components/PreStartChecklistPdf.tsx`, `src/components/CustomerReportPdf.tsx`, `src/components/CertificateOfConformity.tsx`.

**Untouched:** `JobSheetPdfExport.tsx`, `BlankTemplatePdfExport.tsx`, `ScanJobSheet.tsx` — they already consume the shared helpers and inherit the palette change automatically.

---

## What I'm NOT proposing

- **No re-paint of RAMS risk-matrix red/amber/green** — those are semantic, not brand.
- **No change to logo/photo image rendering** — fills only.
- **No new tokens for "success / warning / error"** until you ask for status indicators in PDFs.
