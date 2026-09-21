# Fix mobile Scan Paper Report

## What will change
- Make the scanner dialog reliably open and fit phone screens from both job views, with a visible loading state while its code loads.
- Harden camera and file selection for iPhone and Android images, including browsers without modern image-decoding support.
- Trace classification and OCR through the existing scan pipeline, preserving manual report-type selection when detection is uncertain.
- Show clear error notifications for selection, conversion, classification, OCR, and saving failures; prevent partial success from being presented as complete.
- Verify original-page storage and digital-report saving, then exercise the full phone-sized flow.
- Update the existing Job Detail help guide with the corrected mobile scanning and error behaviour.

## Technical details
- Keep the existing `classify-job-sheet-template` and `ocr-job-sheet` functions; no new backend function.
- Keep scans pre-linked to the current job and retain the existing submissions plus job-sheet-response outputs.
- Add focused tests for mobile image conversion and failure reporting where practical.
