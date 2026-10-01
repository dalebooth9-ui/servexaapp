# Improve engineer before/after photo slots

## Outcome
Engineers can fill every before/after slot from the camera, their device, or photos already attached to the job. Filled slots support full-screen viewing, replacement, and confirmed removal with glove-friendly controls.

## Build
- Add a reusable **Choose from job photos** picker that uses the same combined photo source as the job’s Photos section, including WhatsApp-filed images. Show image thumbnails newest first, resolve private files securely, and exclude video/audio entries.
- Upgrade the report checklist’s before/after slots to show three source choices when empty and clear **Replace** / **Remove** actions when filled. Keep the existing before-photo ghost overlay for matching the after shot.
- Upgrade the remedial/defect before/after slots with the same source choices, full-size preview, replacement menu, and removal confirmation.
- Link an existing job photo by saving its existing durable storage reference into the slot; do not upload or copy the file. Removing a slot clears only that slot reference and never deletes the underlying job photo.
- Update slot state immediately after link, replace, or removal so subsequent report generation and defect/remedial report data use the latest references without reloading the page.
- Update the job-detail Help guide to explain choosing, replacing, viewing, and removing slot photos.

## Technical details
- Reuse `fetchJobPhotoMeta()` and `createSubmissionPhotoSignedUrl()` so picker contents match the job Photos section and retain organisation-scoped access.
- Persist report and remedial slots through `job_photo_checklist_responses.before_photo_url` / `after_photo_url`; no new table is needed.
- Use existing design-system buttons/dialogs for desktop interactions, with at least 44px icon-and-label actions for tablet use.
- Add focused tests for newest-first image filtering and link-without-copy behaviour where practical, then verify the engineer flow at phone and tablet widths and confirm the app build is healthy.
