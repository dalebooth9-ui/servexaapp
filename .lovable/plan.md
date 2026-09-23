# Mobile Scan Paper Report overlay fix

## Scope
- Change only `src/components/paper-scan/JobScanReportDialog.tsx`.
- Keep all scan, upload, OCR, review, save, and desktop behaviour unchanged.

## Implementation
1. Extract the existing dialog header and step content into one shared content variable without altering its contents.
2. When pre-captured `initialFiles` exist, render that content in a solid full-screen fixed overlay with no Radix Dialog primitives.
3. Add a plain close control to the mobile overlay, hidden while processing or saving.
4. Intercept Escape while the mobile overlay is open; prevent default behaviour and only close outside processing or saving.
5. Keep the current Radix Dialog wrapper, sizing, and outside-interaction prevention exactly as-is for the desktop/office path.

## Verification
- Run the focused TypeScript check.
- Confirm the mobile branch contains no Dialog primitives and the desktop branch remains unchanged.
- Check the latest preview build result before reporting completion.
