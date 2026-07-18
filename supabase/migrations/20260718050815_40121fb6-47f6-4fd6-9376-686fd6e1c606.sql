
-- 1. RAMS Library
CREATE TABLE public.rams_library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('whole','block')),
  block_type text,
  work_types text[] NOT NULL DEFAULT '{}',
  name text NOT NULL,
  description text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_rams_kind text,
  source_rams_id uuid,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rams_library_items_org_kind_idx ON public.rams_library_items(org_id, kind) WHERE archived = false;
CREATE INDEX rams_library_items_work_types_idx ON public.rams_library_items USING gin (work_types);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rams_library_items TO authenticated;
GRANT ALL ON public.rams_library_items TO service_role;

ALTER TABLE public.rams_library_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read live library items"
  ON public.rams_library_items FOR SELECT
  TO authenticated
  USING (org_id = get_user_org_id() AND archived = false);

CREATE POLICY "Admins read all library items"
  ON public.rams_library_items FOR SELECT
  TO authenticated
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Admins insert library items"
  ON public.rams_library_items FOR INSERT
  TO authenticated
  WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role) AND auth.uid() = created_by);

CREATE POLICY "Admins update library items"
  ON public.rams_library_items FOR UPDATE
  TO authenticated
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Admins delete library items"
  ON public.rams_library_items FOR DELETE
  TO authenticated
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE TRIGGER trg_rams_library_items_updated_at
  BEFORE UPDATE ON public.rams_library_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. RAMS sign-offs
CREATE TABLE public.rams_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  rams_kind text NOT NULL CHECK (rams_kind IN ('rams','generic_rams','rams_documents')),
  rams_id uuid NOT NULL,
  engineer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  engineer_name text,
  signature_path text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  rams_version integer NOT NULL DEFAULT 1,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rams_kind, rams_id, engineer_id, rams_version)
);
CREATE INDEX rams_signoffs_job_idx ON public.rams_signoffs(job_id);
CREATE INDEX rams_signoffs_rams_idx ON public.rams_signoffs(rams_kind, rams_id);
CREATE INDEX rams_signoffs_org_idx ON public.rams_signoffs(org_id);

GRANT SELECT, INSERT ON public.rams_signoffs TO authenticated;
GRANT ALL ON public.rams_signoffs TO service_role;

ALTER TABLE public.rams_signoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Engineers insert own sign-off for assigned job"
  ON public.rams_signoffs FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = get_user_org_id()
    AND auth.uid() = engineer_id
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.org_id = get_user_org_id()
    )
  );

CREATE POLICY "Engineers read own sign-offs"
  ON public.rams_signoffs FOR SELECT
  TO authenticated
  USING (org_id = get_user_org_id() AND engineer_id = auth.uid());

CREATE POLICY "Admins read all sign-offs in org"
  ON public.rams_signoffs FOR SELECT
  TO authenticated
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE POLICY "Admins delete sign-offs in org"
  ON public.rams_signoffs FOR DELETE
  TO authenticated
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

-- 3. RAMS required on job categories
ALTER TABLE public.job_categories
  ADD COLUMN IF NOT EXISTS rams_required boolean NOT NULL DEFAULT false;

UPDATE public.job_categories
   SET rams_required = true
 WHERE slug ~* '(install|pressure_test|remedial|commission)';
