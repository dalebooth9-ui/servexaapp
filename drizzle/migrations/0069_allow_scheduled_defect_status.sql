CREATE OR REPLACE FUNCTION public.validate_defect_fields() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NEW.severity NOT IN ('low','medium','high','critical') THEN RAISE EXCEPTION 'Invalid defect severity: %',NEW.severity; END IF;
 IF NEW.status NOT IN ('open','in_progress','resolved','deferred','quoted','approved','job_created','declined','scheduled') THEN RAISE EXCEPTION 'Invalid defect status: %',NEW.status; END IF;
 IF NEW.source_kind NOT IN ('job','archive','manual') THEN RAISE EXCEPTION 'Invalid defect source_kind: %',NEW.source_kind; END IF;
 RETURN NEW;
END $$;