
## Goal

Add a backfill tool that turns a photo of a handwritten completed paper job sheet into a real completed job in Servexa — matched to an existing `job_sheet_templates` row, human-reviewed, and stored so the normal branded PDF report generator (`CustomerReportPdf` / job sheet PDF) works with no changes.

## User flow

1. Admin opens **Jobs page → "Scan Paper Report"** (button next to existing "New Job" — admin-only, same role guard as other admin actions).
2. Dialog step 1 — **Upload photos**: one or multiple images (front/back). Reuses the existing camera/upload UI pattern from `ScanJobSheet.tsx`.
3. Dialog step 2 — **AI processing** (single loading state):
   - Call new edge function `scan-completed-job-report`.
   - Function first classifies which `job_sheet_templates` row best matches the form (using template name + category + first ~6 field labels as keywords).
   - Then runs the existing OCR + extraction pipeline against that template's fields.
   - Returns `{ template, extracted, header, candidate_matches, _ocr_path }`. `candidate_matches` = top 3 templates so the admin can override.
4. Dialog step 3 — **Review form**:
   - Template selector at top (pre-selected to the AI pick, with confidence hint; admin can swap to any other template — re-triggers extraction for that template).
   - Customer picker (reuses `CustomerCombobox`) — required, no auto-create for customers.
   - Site picker (reuses `SiteCombobox`, scoped to chosen customer) with **"+ Create new site"** inline — opens a small form (name / address / postcode / riser_location) that creates the site + customer_sites junction row before continuing.
   - Job header fields (name, PO number, completion date, engineer/technician).
   - Full field grid rendered from the template's `fields` JSON, pre-filled with the extracted answers. Each row is editable (text, checkbox tri-state yes/no/N/A, select) using the same value shapes the existing job sheet UI writes (`true`/`false`/`"N/A"`/descriptive string).
   - Warning banner listing fields the OCR left blank or low-confidence so the admin can spot gaps.
5. Dialog step 4 — **Confirm & file**:
   - Insert a new `jobs` row: `status='completed'`, `source='paper backfill'`, `category` derived from the template, `completed_at` from the reviewed date, `completed_by` = current admin, org + customer + site set.
   - Insert `job_sheet_responses` with `status='submitted'`, `submitted_at=now()`, `submitted_by`=current admin, `responses` = the reviewed object.
   - Upload each source photo to the existing `job-documents` storage bucket and insert `job_documents` rows tagged `document_type='source_scan'` so they appear in the job's Documents panel as evidence (same code path as attaching a PDF today).
   - Toast success + link to the new job so Dale can generate the branded Customer Report PDF immediately.

Existing UI style, admin role check (`useEngineerPageAccess` + `has_role_in_org(..., 'admin')`), and org scoping are preserved. No changes to how field engineers submit sheets on live jobs.

## Files

New:
- `supabase/functions/scan-completed-job-report/index.ts` — orchestration edge fn.
  1. Auth via JWT (same pattern as `ocr-job-sheet`).
  2. Load all published `job_sheet_templates` for the caller's org (+ global org-null ones).
  3. If `template_id` in body is set, skip classification; otherwise call Lovable AI (`google/gemini-3-flash-preview`, vision) with the images + a compact `{id, name, category, top_field_labels}` list and ask for the best match + top 3.
  4. Delegate the OCR/extract logic to the shared code used by `ocr-job-sheet` (extract the reusable pieces into `supabase/functions/_shared/jobSheetOcr.ts` and import from both fns — no behaviour change to `ocr-job-sheet`).
  5. Return `{ template_id, template_name, candidate_matches, extracted, header, _ocr_path }`.
- `supabase/functions/_shared/jobSheetOcr.ts` — extracted helpers (`analyzeWithAzure`, `gptFieldMapping`, `gptVisionFallback`, `buildExtractionTool`, normalisation utilities). Pure refactor of the code currently inside `ocr-job-sheet/index.ts`.
- `src/components/ScanCompletedJobDialog.tsx` — the multi-step dialog (upload → processing → review → confirm). Follows the styling of `ScanAssetsDialog.tsx` and `ScanJobSheet.tsx`.
- `src/components/scan-completed/CreateSiteInline.tsx` — small inline form used by the site picker to add a missing site.

Edited:
- `src/pages/Jobs.tsx` — add the "Scan Paper Report" button (admin-only) that opens `ScanCompletedJobDialog`.
- `supabase/functions/ocr-job-sheet/index.ts` — import from `_shared/jobSheetOcr.ts` instead of the inline copies (behaviour identical).

No DB migration required — everything reuses existing tables (`jobs`, `job_sheet_responses`, `job_documents`, `sites`, `customer_sites`) and their existing RLS policies.

## Technical notes

- Template classification uses vision on a single downsized image (max 1024px, quality 0.6) to keep latency + tokens down. Full-res images are passed only to the extraction stage.
- Extraction reuses the exact Azure → GPT-vision fallback pipeline already in production, so answer shapes match what the branded PDF generator expects. No new normalisation rules.
- Value shapes written to `job_sheet_responses.responses`:
  - Checkbox: `true` / `false` / `"N/A"` (string).
  - Descriptive answers ("N/A - exposed valve"): stored verbatim — `pdfBody.ts` already renders strings as descriptive text.
  - Dates: stored as `dd/mm/yyyy` string (matches existing responses).
- Photo evidence: stored under `job-documents/<org_id>/<job_id>/paper-scan-<n>.<ext>`. Row `document_type='source_scan'`, `uploaded_by=admin`, so it shows in the existing Documents tab with no UI changes.
- Admin gating: dialog trigger hidden unless `has_role('admin')`, and the edge function re-checks `has_role_in_org` before performing writes — defence in depth like other admin-only fns.
- Multi-tenant: every insert scopes `org_id = get_user_org_id()`; edge fn refuses if org mismatch.
- Error surfaces: 402 (credits) / 429 (rate limit) from Lovable AI bubble up as clear toast messages, matching the pattern in `ScanJobSheet.tsx`.

## Out of scope (v1)

- No auto-creation of customers (only sites) — matching request.
- No bulk upload of many forms at once; one form → one job per dialog run.
- No editing of a filed backfill from inside this dialog — after confirm the admin uses the normal job/response edit screens.
