# Permanent photo compliance stamps

## Scope
Add a permanent visible stamp to checklist photos and general job photos only. Videos, PDFs, audio, existing photos, site-survey media, annotations, lightbox playback, and transcription remain unchanged.

## Implementation
1. Add `src/lib/photoStamp.ts` with:
   - EXIF-aware image decoding and Canvas rendering.
   - A bottom-right, readable date/time, job-reference, and optional GPS stamp.
   - UK `DD/MM/YYYY HH:MM` formatting and six-decimal coordinates.
   - Silent GPS fallback after five seconds, plus safe image/blob export errors instead of non-null assertions.
2. Update `PhotoChecklistCapture` to accept the job reference, stamp each image before storage upload, save it as JPEG, and retain the existing checklist response workflow.
3. Update the shared job submission uploader to stamp image files only before upload. Resolve or accept the job reference once per upload batch, obtain GPS without blocking beyond the configured timeout, and preserve original handling for videos, documents, and audio.
4. Pass the loaded job reference into `PhotoChecklistCapture` and `JobPhotos` from both office and engineer job views. Keep the stamped blob as the payload used by any upload/queue fallback so queued images are never unstamped.
5. Update the existing Jobs help guide to explain that newly added job/checklist photos permanently include capture date, time, job reference, and GPS when location is available. The current job-detail help route already points to this guide.

## Validation
- Add focused tests for UK stamp text, optional job reference/GPS lines, image-only conversion, and GPS denial/timeout fallback where practical.
- Run the relevant tests and inspect the post-change build result.
- Verify in the preview that image upload controls remain available and non-image media controls are unchanged; authenticated upload completion depends on an available preview session.

## Assumptions
- “All photos” means the two paths explicitly requested: photo checklist capture and general job submission photos.
- Previously uploaded photos are not rewritten.
- A missing/denied GPS location silently produces a date/time and job-reference stamp.
