# Remove switched-report wording from customer PDFs

## Changes
- Treat an active Dry Riser mode switch as **Dry Riser Visual Inspection** throughout customer PDF generation, including legacy fallback reports that still reference the pressure-test template.
- Remove the yellow switch-reason banner and its layout spacing from the customer PDF only. Keep `_mode_switch.reason`, note, and internal note unchanged so office screens continue showing them.
- Use the visual report name for the PDF title/header, Scope of works, generated filename, and report-specific customer email subject wording.
- Leave pressure-test PDFs, the on-screen report form, and all unrelated templates unchanged.

## Verification
- Add focused PDF regression coverage proving the banner/reason and pressure-test wording are absent, the visual title/scope/filename are present, and the main report remains one page.
- Open and regenerate the completed Craven House visual report, save a proof PDF, render it to images, and visually inspect every page for layout or clipping.
- Update the existing Help guidance to reflect what customers see, without exposing the office-only switch reason.

## Technical details
- Centralise the customer-facing effective report name in the existing report-mode switch helper, then consume it inside the shared job-sheet PDF generator and customer-send flow.
- Do not alter the stored report response or remove `_mode_switch`; existing completed reports pick up the change because their PDF is generated from current response data when opened.
