
## Problem Summary

There are two distinct issues to fix in `src/components/JobDocuments.tsx`:

### Issue 1: Auto-attached docs don't stay in sync with the template settings

Currently, `autoAttachCategoryDocuments` only **adds** new documents when a template is missing — it never **removes** stale ones. So if a template is disabled or deleted in Settings, the old `job_documents` row persists on the job.

The fix is to make the sync **bidirectional**:
- Add new entries for templates that exist in Settings but not yet on the job
- Remove stale entries for job_documents rows whose `category_template_id` no longer matches an **enabled** template in Settings

### Issue 2: Completed/cancelled jobs still show old auto-attached rows

The current guard (`if job.status === 'completed' || 'cancelled') return`) only prevents **new** auto-attachments. It doesn't remove previously auto-attached documents that were created before this fix was in place.

The fix is: when the job is `completed` or `cancelled`, **delete all existing `source = "auto"` job_documents rows** for that job on mount, so they are cleaned up.

---

## Technical Changes

### `src/components/JobDocuments.tsx`

**Change 1 — Completed/Cancelled cleanup:**

In the `useEffect` that currently returns early for completed/cancelled jobs, instead of just returning, actively delete any existing auto-attached documents for the job:

```typescript
useEffect(() => {
  if (!job?.category || !user || userRole !== "admin") return;
  
  if (job?.status === "completed" || job?.status === "cancelled") {
    // Clean up any stale auto-attached docs from before the fix
    supabase
      .from("job_documents")
      .delete()
      .eq("job_id", jobId)
      .eq("source", "auto")
      .then(() => fetchDocs());
    return;
  }
  
  autoAttachCategoryDocuments();
}, [job?.category, job?.status]);
```

**Change 2 — Bidirectional sync for active jobs:**

Rewrite `autoAttachCategoryDocuments` to also remove stale entries. After fetching the current enabled template IDs from `category_document_templates`, compare them against the existing `job_documents` rows:

- Rows whose `category_template_id` is NOT in the current enabled template list → **delete** them
- Templates whose ID is NOT yet in the existing job_documents rows → **insert** them

This ensures the Documents panel always mirrors exactly what is configured in Settings.

---

## Files to Edit

- `src/components/JobDocuments.tsx` — both the `useEffect` and `autoAttachCategoryDocuments` function
