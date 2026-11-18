ALTER TABLE public.archived_documents ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS archived_documents_asset_id_idx ON public.archived_documents(asset_id);
ALTER TABLE public.asset_service_history ADD COLUMN IF NOT EXISTS archived_document_id uuid REFERENCES public.archived_documents(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS asset_service_history_archive_uniq ON public.asset_service_history(asset_id, archived_document_id) WHERE archived_document_id IS NOT NULL;