-- Re-run extraction on remaining unfiled paper-scan queue items so their
-- customer guesses pick up the new letterhead detection. Already-filed or
-- rejected items are left alone.
UPDATE public.paper_scan_batch_items
SET status = 'pending', error = NULL
WHERE status IN ('ready', 'low_confidence', 'failed');

-- Reopen the affected batches so the background processor picks them up.
UPDATE public.paper_scan_batches
SET status = 'processing'
WHERE id IN (
  SELECT DISTINCT batch_id FROM public.paper_scan_batch_items
  WHERE status = 'pending'
);
