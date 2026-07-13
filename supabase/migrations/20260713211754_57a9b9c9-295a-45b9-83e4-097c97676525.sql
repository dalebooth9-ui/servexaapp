
-- 1. Extend defect status values
CREATE OR REPLACE FUNCTION public.validate_defect_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.severity NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Invalid defect severity: %', NEW.severity;
  END IF;
  IF NEW.status NOT IN ('open', 'in_progress', 'resolved', 'deferred', 'quoted', 'approved', 'job_created', 'declined') THEN
    RAISE EXCEPTION 'Invalid defect status: %', NEW.status;
  END IF;
  IF NEW.category IS NOT NULL AND NEW.category NOT IN ('fire_alarm','emergency_lighting','extinguisher','sprinkler','dry_riser','suppression','passive_fire','other') THEN
    RAISE EXCEPTION 'Invalid defect category: %', NEW.category;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Link defects to their remedial job
ALTER TABLE public.defects
  ADD COLUMN IF NOT EXISTS remedial_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS defects_remedial_job_id_idx ON public.defects(remedial_job_id);
CREATE INDEX IF NOT EXISTS defects_quote_id_idx ON public.defects(quote_id);

-- 3. Trigger: when a quote's status changes, sync linked defects
CREATE OR REPLACE FUNCTION public.sync_defects_on_quote_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.document_type = 'quote' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'accepted' THEN
      UPDATE public.defects
         SET status = 'approved'
       WHERE quote_id = NEW.id
         AND status IN ('quoted', 'open', 'in_progress');
    ELSIF NEW.status = 'declined' THEN
      UPDATE public.defects
         SET status = 'declined'
       WHERE quote_id = NEW.id
         AND status IN ('quoted', 'approved');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_defects_on_quote_status ON public.invoices;
CREATE TRIGGER trg_sync_defects_on_quote_status
AFTER UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_defects_on_quote_status();

-- 4. Trigger: when a remedial job completes, resolve its linked defects
CREATE OR REPLACE FUNCTION public.sync_defects_on_remedial_job_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    UPDATE public.defects
       SET status = 'resolved',
           resolved_at = now(),
           resolved_by = COALESCE(resolved_by, auth.uid())
     WHERE remedial_job_id = NEW.id
       AND status <> 'resolved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_defects_on_remedial_job_complete ON public.jobs;
CREATE TRIGGER trg_sync_defects_on_remedial_job_complete
AFTER UPDATE OF status ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.sync_defects_on_remedial_job_complete();
