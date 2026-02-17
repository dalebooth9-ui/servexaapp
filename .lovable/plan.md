

## Surface Rate Limit and Credit Exhaustion Errors in BulkImportDialog

### What Changes
Update the `BulkImportDialog` component to detect 429 and 402 error responses from the `parse-import-document` edge function and show specific toast notifications instead of a generic error message.

### Technical Details

**File: `src/components/BulkImportDialog.tsx`**

In the `handleFile` function, where `.pdf`/`.docx`/`.doc` files are processed, the current `catch` block and error handling only checks `fnError` or `data?.error` generically. The change will:

1. After calling `supabase.functions.invoke("parse-import-document", ...)`, inspect the returned `error` object for status codes (Supabase client wraps HTTP errors).
2. Check `data?.error` string for the known messages ("Rate limit exceeded" and "AI credits exhausted") since the edge function returns these as JSON error messages.
3. Show a descriptive toast notification for each case:
   - **429**: Toast with title "Rate limit exceeded" and description asking to wait and retry.
   - **402**: Toast with title "Credits exhausted" and description about adding funds.
4. For other errors, keep the existing generic error behavior.

The same pattern will be applied to the `handleImport` function for the `bulk-import-jobs` edge function call, ensuring consistent error surfacing across both import paths.

