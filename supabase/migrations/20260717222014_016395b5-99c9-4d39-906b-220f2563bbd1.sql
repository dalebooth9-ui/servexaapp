
-- Publish uniqueness guard for job_sheet_templates.
-- Prevents publishing two templates in the same org whose names differ
-- only by dash character / whitespace / punctuation
-- (e.g. "Fire Extinguisher – Annual Service" (en dash) vs
--       "Fire Extinguisher — Annual Service" (em dash)).
-- Raised as EXCEPTION so the UI shows an actionable error; the office
-- can either rename the new draft or unpublish the existing canonical
-- before re-trying.

CREATE OR REPLACE FUNCTION public.normalise_template_name(_name text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(lower(coalesce(_name, '')),
                            '[\u2010-\u2015\u2212]', '-', 'g'),
             '[^a-z0-9\- ]+', '', 'g'),
           '\s+', ' ', 'g'
         );
$$;

CREATE OR REPLACE FUNCTION public.guard_job_sheet_template_publish_unique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflict text;
BEGIN
  IF NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'published'
     AND public.normalise_template_name(OLD.name) = public.normalise_template_name(NEW.name)
     AND OLD.org_id IS NOT DISTINCT FROM NEW.org_id THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_conflict
    FROM public.job_sheet_templates
   WHERE id <> NEW.id
     AND status = 'published'
     AND org_id IS NOT DISTINCT FROM NEW.org_id
     AND public.normalise_template_name(name) = public.normalise_template_name(NEW.name)
   LIMIT 1;

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION
      'Another published template with a matching name already exists in this org: "%". Rename this template or unpublish the existing one before publishing.',
      v_conflict
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_sheet_template_publish_unique ON public.job_sheet_templates;
CREATE TRIGGER trg_job_sheet_template_publish_unique
BEFORE INSERT OR UPDATE OF name, status, org_id ON public.job_sheet_templates
FOR EACH ROW EXECUTE FUNCTION public.guard_job_sheet_template_publish_unique();
