UPDATE public.paper_scan_batch_items
SET status = 'pending', error = NULL
WHERE batch_id = 'a3998459-05b7-4280-9dd3-8a98d92cc3c3'
  AND status = 'failed';

UPDATE public.paper_scan_batches
SET status = 'processing', processed_items = 0
WHERE id = 'a3998459-05b7-4280-9dd3-8a98d92cc3c3';