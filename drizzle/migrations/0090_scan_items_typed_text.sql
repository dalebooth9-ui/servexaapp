ALTER TABLE public.paper_scan_batch_items ADD COLUMN IF NOT EXISTS typed_text text;
ALTER TABLE public.paper_scan_batch_items ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'scan';
ALTER TABLE public.paper_scan_batch_items ADD COLUMN IF NOT EXISTS source_file_path text;