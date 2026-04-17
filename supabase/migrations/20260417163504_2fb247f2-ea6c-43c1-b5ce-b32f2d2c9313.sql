-- Fire log tokens
CREATE TABLE IF NOT EXISTS public.fire_log_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fire_log_tokens_token ON public.fire_log_tokens(token);
CREATE INDEX IF NOT EXISTS idx_fire_log_tokens_site ON public.fire_log_tokens(site_id);

ALTER TABLE public.fire_log_tokens ENABLE ROW LEVEL SECURITY;

-- Fire log entries
CREATE TABLE IF NOT EXISTS public.fire_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  entry_type text NOT NULL DEFAULT 'other',
  title text NOT NULL,
  description text,
  date_of_event date NOT NULL DEFAULT CURRENT_DATE,
  recorded_by text,
  bs_standard text,
  linked_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fire_log_entries_site ON public.fire_log_entries(site_id, date_of_event DESC);
CREATE INDEX IF NOT EXISTS idx_fire_log_entries_job ON public.fire_log_entries(linked_job_id);

ALTER TABLE public.fire_log_entries ENABLE ROW LEVEL SECURITY;

-- Validation
CREATE OR REPLACE FUNCTION public.validate_fire_log_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.entry_type NOT IN ('inspection','test','fault','repair','false_alarm','evacuation_drill','maintenance','other') THEN
    RAISE EXCEPTION 'Invalid fire log entry type: %', NEW.entry_type;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_fire_log_entry ON public.fire_log_entries;
CREATE TRIGGER trg_validate_fire_log_entry
BEFORE INSERT OR UPDATE ON public.fire_log_entries
FOR EACH ROW EXECUTE FUNCTION public.validate_fire_log_entry();

-- RLS: tokens
CREATE POLICY "Public can read active fire log tokens"
ON public.fire_log_tokens FOR SELECT
TO anon, authenticated
USING (is_active = true);

CREATE POLICY "Admins manage fire log tokens"
ON public.fire_log_tokens FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS: entries
-- Public read when an active token exists for that site
CREATE POLICY "Public can read entries for sites with active tokens"
ON public.fire_log_entries FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.fire_log_tokens t
    WHERE t.site_id = fire_log_entries.site_id AND t.is_active = true
  )
);

CREATE POLICY "Admins manage fire log entries"
ON public.fire_log_entries FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can insert fire log entries"
ON public.fire_log_entries FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Auto-create entry when a fire-related job completes
CREATE OR REPLACE FUNCTION public.auto_create_fire_log_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_entry_type text := 'other';
  v_recorded_by text;
  v_title_lower text;
BEGIN
  IF (TG_OP = 'UPDATE') AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' AND NEW.site_id IS NOT NULL THEN
    v_title_lower := lower(coalesce(NEW.title, '') || ' ' || coalesce(NEW.category, ''));

    IF v_title_lower !~ 'fire|alarm|extinguisher|sprinkler|riser|suppression|emergency light|evacuation' THEN
      RETURN NEW;
    END IF;

    IF v_title_lower ~ 'inspect' THEN v_entry_type := 'inspection';
    ELSIF v_title_lower ~ 'test' THEN v_entry_type := 'test';
    ELSIF v_title_lower ~ 'repair|fix' THEN v_entry_type := 'repair';
    ELSIF v_title_lower ~ 'fault' THEN v_entry_type := 'fault';
    ELSIF v_title_lower ~ 'drill|evacuat' THEN v_entry_type := 'evacuation_drill';
    ELSIF v_title_lower ~ 'maint|service|ppm' THEN v_entry_type := 'maintenance';
    END IF;

    SELECT full_name INTO v_recorded_by FROM public.profiles WHERE user_id = auth.uid();

    INSERT INTO public.fire_log_entries (
      org_id, site_id, entry_type, title, description,
      date_of_event, recorded_by, linked_job_id, created_by
    ) VALUES (
      NEW.org_id, NEW.site_id, v_entry_type,
      COALESCE(NEW.title, NEW.reference_number, 'Fire safety job completed'),
      NEW.description,
      CURRENT_DATE,
      COALESCE(v_recorded_by, 'System'),
      NEW.id,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_fire_log_entry ON public.jobs;
CREATE TRIGGER trg_auto_fire_log_entry
AFTER UPDATE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.auto_create_fire_log_entry();