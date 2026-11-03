# Stage 2: QR stickers, scanning and the QR on reports

Builds on the Stage 1 dry riser assets. The 6-character asset tag is the sticker ID. Reuses the existing QR library (qrcode.react, plus its QR maths for PDFs). Nothing unrelated changes.

## 1. Sticker status on each riser
- New fields on assets: sticker status (none / printed / placed, default none), printed time, fitted time, fitted by.
- Assets already have org-scoped security; no new table, so no new access rules beyond the existing org-only ones.
- Customer portal: it does not show assets today. It stays that way — no sticker ID, sticker status or imported remedials appear there.

## 2. "Print sticker pack" on the job (office)
- New button on the job page opens a dialog listing the site's dry risers in the same order as the riser list on the job sheet (by riser location, then created date).
- Default: only risers with sticker status none or printed. Tick box "Include risers that already have a placed sticker" (off).
- PDF for Avery L4778: A4, labels 45.7 x 21.2 mm, 4 across x 12 down. Top and left offset nudges (mm, saved on the device), plus "Print test page on plain paper" showing dotted label outlines.
- Each label: QR to https://servexaapp.com/r/<ID> with a white quiet zone, the ID in large bold black text, and a logo. Logo rule: customer has its own logo → no logo; otherwise the Viva logo from organisation branding. Black on white only.
- Downloading the pack sets sticker status to printed (never downgrades a placed sticker).
- No risers at the site: "Add risers to this site" — enter how many, then a riser location for each; this creates the dry riser assets (tags auto-generated) so stickers can be printed.
- On the dry riser job sheet (on-screen, below the form, not on the PDF): a list of the site's risers with sticker ID and a "Label fitted" tick box, so the engineer matches stickers to risers. Ticking sets placed + time + engineer.

## 3. Scan page /r/<ID>
- Login keeps the destination: any signed-out redirect to the login page remembers where the user was going and returns there after sign-in (applies to all protected pages, which fixes the current always-home behaviour).
- Signed out: neutral page — "Riser ID ABC123" and a "Staff login" button. Nothing else (no company, site, customer, history, codes or phone numbers). The page itself loads no data when signed out.
- Signed in staff, tag found: riser location in large text, site name, outlets, last inspection, open defects, and buttons:
  - "Label fitted" (only if not placed) → placed, time, user.
  - "Wrong riser" → note box, sends an Asset review flag (field "label") to the office.
  - "Start service" → creates a new job for that customer and site, with that riser pre-picked on the dry riser report, then opens it. Office only for creating jobs unless engineers already have job-create access (follows existing permission).
- Signed in, tag not found (or not in your organisation): "Sticker not found" with a link to the dashboard.
- Customer portal users get the neutral page.

## 4. QR on dry riser report PDFs
- Pressure test, visual inspection and dry riser remedial report PDFs: when the report is linked to a dry riser asset, print a QR (at least 20 mm) and "Riser ID ABC123" in the top-right of that riser's page, black on white.
- Customer-branded reports: only the QR and ID in that corner — no Viva logo, name or footer text beside it. Viva-branded: same QR and ID.
- No other layout change; reports not linked to a riser are untouched. Check the one-page fit on Craven House.

## 5. Sticker column
- Assets > Dry risers table and the site's Dry risers list: small "Sticker" column (none / printed / placed) and a "Printed but not placed" filter.

## Help
- Update Help & guides: sticker pack, scan page, label fitted, QR on reports (plus route rule for /r).

## Technical details
- Migration: `assets.label_status text not null default 'none'` with validation trigger (none/printed/placed), `label_printed_at`, `label_placed_at timestamptz`, `label_placed_by uuid`. Asset updates by engineers go through a security-definer RPC `mark_asset_label_placed(asset_id)` (same-org check) and `report_wrong_riser(asset_id, note)` inserting an `asset_review_flags` row with org_id; `mark_assets_label_printed(ids[])` admin-only. `lookup_asset_by_tag(tag)` returns data only for authenticated staff in the same org.
- Login return: `ProtectedRoute`/`AdminRoute`/`AccessRoute` pass `state.from` (and a sessionStorage fallback for OAuth/email links); `AuthRoute`/Auth page navigates there after sign-in, only for same-origin paths.
- Sticker PDF: jsPDF, QR drawn as vector modules from `qrcode` matrix (same generator qrcode.react uses), new `src/lib/stickerPackPdf.ts` with layout constants and a unit test for the label grid positions.
- Report QR: added in `JobSheetPdfExport.tsx` after the header for dry riser templates when `riser_asset_id` resolves; reserved corner area so the header does not overlap.
- New route `/r/:tag` outside ProtectedRoute (renders neutral view when signed out).
- AGENTS.md rule for sticker status changes via RPCs.

## Not in scope
- Portal toggle to show tags/sticker status/remedials (stays off; not built until you ask).
