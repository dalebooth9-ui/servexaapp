## Audit — Accreditation Logos, Watermark, Branding Overlay & Dimensions

The "happy path" is `renderBrandingOverlay()` in `src/lib/pdfBranding.ts`, which in one call:
- applies the watermark to every page using the org-wide `WatermarkSettings` (mode + opacity)
- applies accreditation logos to every page using the **same** opacity
- honours per-export overrides
- respects `mode === "none"` for both

Every generator that bypasses this helper drifts in at least one dimension.

---

### 1. Path: branding overlay (watermark + accreditation, all pages)

| Generator | Uses `renderBrandingOverlay`? | `accredFooterY` | `accredLogoH` | `brandColor` tint | Per-export override |
|---|---|---|---|---|---|
| `JobSheetPdfExport.tsx` | ✅ | `declarationFooterY` (computed) | `logoH` (computed) | `accentColor` ✅ | ❌ not passed |
| `BlankTemplatePdfExport.tsx` | ✅ | computed | computed | not passed | ✅ `override` |
| `CustomerReportPdf.tsx` | ✅ | `footerY` (computed) | default `7mm` | not passed | ❌ |
| `ScanJobSheet.tsx` | ✅ | `footerStartY` | `12mm` | `accentColor` ✅ | ❌ |
| `JobPdfReport.tsx` | ✅ | **`279` hard-coded** | default `7mm` | not passed | ❌ |
| `ramsPdf.ts` | ✅ | **`PAGE_H - 21` (276)** | **`18mm`** | not passed | ❌ |
| `ramsPdfBase.ts` | ✅ | **`278` hard-coded** | **`14mm`** | not passed | ❌ |
| `PreStartChecklistPdf.tsx` | ❌ **rolls own** | `ph - 26` | `logoH` (computed) | n/a | reads `watermarkSettings` directly |
| `CertificateOfConformity.tsx` | ❌ **rolls own** | `footerBandY - accrH - 6` | `accrH` | n/a | reads `watermarkSettings` directly |

### 2. Drift summary

#### A. Two generators bypass the unified helper entirely
- **`PreStartChecklistPdf.tsx`** (lines 41-48, 286-287) — calls `addWatermarkToAllPages` + `renderAccreditationLogos` separately, manually gated by `watermarkSettings.mode !== "none"`.
- **`CertificateOfConformity.tsx`** (lines 460-470, 610-611) — same pattern: dynamic-imports both helpers, gates manually.

Both work, but they:
- duplicate the `mode === "none"` gating logic (so any future change to the gating rule has to be made in three places),
- ignore the per-export `WatermarkOverride` mechanism — the PDF preview dialog cannot tweak watermark/accreditation on these two outputs,
- can drift in opacity/mode if `loadWatermarkSettings()` semantics change.

#### B. Accreditation `accredFooterY` is hard-coded in three generators
- `JobPdfReport.tsx`: `accredFooterY: 279` — magic number, no relation to actual footer position.
- `ramsPdf.ts`: `accredFooterY: PAGE_H - 21` (= 276mm on A4) with `accredLogoH: 18` — a much taller logo strip than every other template.
- `ramsPdfBase.ts`: `accredFooterY: 278` with `accredLogoH: 14` — different again.

Compare with `JobSheetPdfExport`/`BlankTemplate`/`CustomerReport`/`Scan` which all pass a **computed** Y derived from where the actual footer/declaration ends. The hard-coded values risk overlapping or floating away from the footer if the footer chrome changes.

#### C. Accreditation logo height varies 7→18 mm

| Height | Templates |
|---|---|
| `7mm` (helper default) | `CustomerReportPdf`, `JobPdfReport` |
| `12mm` | `ScanJobSheet` |
| `14mm` | `ramsPdfBase` (variants) |
| `18mm` | `ramsPdf` (Dry Riser) |
| computed (per-template) | `JobSheetPdfExport`, `BlankTemplatePdfExport`, `PreStartChecklist`, `CertificateOfConformity` |

→ **2.5× variance in the same logo across the same product.**

#### D. Watermark dimensions are consistent (good)
`addWatermarkToAllPages` is the single code path. Every caller gets the same `pageHeight * 0.85` watermark, centred, with the same opacity scale. ✅

#### E. Brand-colour tint is inconsistent
Only `JobSheetPdfExport` and `ScanJobSheet` pass `brandColor: accentColor` to tint the watermark. Every other generator sends `undefined` → untinted Viva Flame even when a customer's brand colour is available in `template.branding`. This contradicts `mem://features/servexa-reports` which says PDFs theme from extracted brand colours.

#### F. Logo & header dimensions in document chrome (separate from accreditation)
From the earlier header audit:
- Logo height: 20mm (shared `renderPdfHeader`) vs 40mm (`PreStartChecklist`) vs `pw - MR - logoW` placement (Cert).
- Header band height: ~30mm shared vs ~32-38mm bespoke.
- Margin: consistent at `10mm` everywhere ✅ except `ML/MR = 14mm` in RAMS (`ramsPdfBase.ts`) and Cert (`CertificateOfConformity.tsx`).
- Column widths: see prior data-row audit (68% / 55mm / 52mm / per-template).

---

## Prioritised Fix List

### P0 — Migrate the two roll-your-own generators onto `renderBrandingOverlay`

Highest leverage, lowest risk. Both currently miss the `WatermarkOverride` plumbing and duplicate gating logic.

**Files:** `PreStartChecklistPdf.tsx`, `CertificateOfConformity.tsx`
**Change:** Replace the manual `addWatermarkToAllPages` + `renderAccreditationLogos` pair at the end of each generator with a single `renderBrandingOverlay({ watermark, accredLogos, accredFooterY, accredLogoH })` call. Delete the local `watermarkSettings.mode !== "none"` gates.

### P1 — Standardise `accredLogoH` to a single token

Add to `src/lib/pdfPalette.ts` (or a new `pdfDimensions.ts`):
```ts
export const PDF_DIMENSIONS = {
  margin: 10,
  accredLogoH: 12,     // settled middle ground
  accredLogoGapToFooter: 3,
  watermarkHeightRatio: 0.85,
  headerHeight: 30,
  headerLogoH: 20,
} as const;
```
Then drop the per-call `accredLogoH` overrides in `JobPdfReport`, `ramsPdf`, `ramsPdfBase`, `ScanJobSheet` so they all read `PDF_DIMENSIONS.accredLogoH`. Existing computed values in `JobSheetPdfExport` / `BlankTemplate` keep their dynamic logic but seeded from the token.

### P2 — Replace hard-coded `accredFooterY` magic numbers with computed values

**`JobPdfReport.tsx:604`** (`accredFooterY: 279`) → compute from `PAGE_H - PDF_DIMENSIONS.margin - footerHeight` like `CustomerReportPdf` does.
**`ramsPdf.ts:1051`** (`PAGE_H - 21`) and **`ramsPdfBase.ts:946`** (`278`) → expose a `RAMS_FOOTER_TOP` constant in `ramsPdfBase.ts` and reference it in both files so they can never drift again.

### P3 — Pass `brandColor` consistently for tinted watermark

Currently only `JobSheetPdfExport` and `ScanJobSheet` benefit from per-customer tinting. Extend to:
- `BlankTemplatePdfExport` — already computes `accentColor`-equivalent in `template.branding`; pass it through.
- `CustomerReportPdf` — has `branding.primary`; pass it.
- `JobPdfReport` — derive from `job.customers?.brand_color` if present, fallback to `PDF_PALETTE.navy` (already done in our earlier palette work — wire it through here).

`ramsPdf` / `ramsPdfBase` / `PreStartChecklist` / `CertificateOfConformity` should explicitly **opt out** with a comment ("Viva-branded document — never tinted to customer colour") so the divergence is intentional, not accidental.

### P4 — Standardise document margins

`ML = MR = 14mm` in RAMS + Cert vs `margin = 10mm` everywhere else. Pick one. Recommend **10mm** everywhere (the more common value) and add `PDF_DIMENSIONS.margin = 10` as the single source. The 4mm RAMS gain isn't load-bearing — RAMS tables already use `CONTENT_W` derived from margins, so the rows will simply be 8mm wider (improvement, not regression).

### P5 — Per-export `WatermarkOverride` plumbing

After P0, the two ex-bespoke generators inherit override support for free, but the call sites (preview dialogs that trigger them) need to actually pass the override. Audit `PreStartChecklist` and `CoC` triggers and surface a watermark-control UI consistent with `BlankTemplatePdfExport`'s `watermarkControls`. This is the only fix that touches React components, not just PDF code.

### P6 — Consolidate header chrome (already-known drift)

This was covered by the earlier header-structure audit. The work that delivers it:
- Extend `renderPdfHeader` with `{ variant: "centred" | "left" | "right" | "compact", showDetailGrid: boolean }`.
- Migrate `JobPdfReport`, `CertificateOfConformity`, `PreStartChecklistPdf`, and the RAMS modules off their bespoke headers.

Standalone plan if you want it as one task; otherwise pair with P3 since both touch the same files.

---

## Files Touched (cumulative for P0–P5)

**New:** `src/lib/pdfDimensions.ts` (or extend `pdfPalette.ts`).
**Modified:** `pdfBranding.ts`, `pdfAccreditations.ts` (default `logoH` → `PDF_DIMENSIONS.accredLogoH`), `JobPdfReport.tsx`, `ramsPdf.ts`, `ramsPdfBase.ts`, `ScanJobSheet.tsx`, `JobSheetPdfExport.tsx`, `BlankTemplatePdfExport.tsx`, `CustomerReportPdf.tsx`, `PreStartChecklistPdf.tsx`, `CertificateOfConformity.tsx`.

---

## Recommendation

Implement **P0 + P1 + P2 + P4** as one batch. They're all "delete drift" work with no behaviour change for the user beyond visual consistency. **P3 + P5** are feature-bearing changes that warrant a separate review. **P6** is the largest and was already scoped in the header audit.
