-- Track defects sourced from archived documents (historic paper scans)
ALTER TABLE public.defects
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'job',
  ADD COLUMN IF NOT EXISTS source_archived_document_id uuid
    REFERENCES public.archived_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS defects_source_kind_idx
  ON public.defects(source_kind);
CREATE INDEX IF NOT EXISTS defects_source_archived_document_idx
  ON public.defects(source_archived_document_id)
  WHERE source_archived_document_id IS NOT NULL;

-- Broaden the validation trigger to accept the new archive-sourced state
-- and the extra workflow statuses the app already uses in the UI. The old
-- trigger only whitelisted open/in_progress/resolved/deferred and would reject
-- inserts for archive-sourced defects that flow through quoted/approved/etc.
CREATE OR REPLACE FUNCTION public.validate_defect_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.severity NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Invalid defect severity: %', NEW.severity;
  END IF;
  IF NEW.status NOT IN (
    'open','in_progress','resolved','deferred',
    'quoted','approved','job_created','declined'
  ) THEN
    RAISE EXCEPTION 'Invalid defect status: %', NEW.status;
  END IF;
  IF NEW.source_kind NOT IN ('job','archive','manual') THEN
    RAISE EXCEPTION 'Invalid defect source_kind: %', NEW.source_kind;
  END IF;
  RETURN NEW;
END;
$$;