CREATE TABLE public.data_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  stage text,
  file_path text,
  file_size bigint,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT ON public.data_exports TO authenticated;
GRANT ALL ON public.data_exports TO service_role;

ALTER TABLE public.data_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins view their exports"
ON public.data_exports
FOR SELECT
TO authenticated
USING (org_id = public.get_user_org_id() AND public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_data_exports_org_created ON public.data_exports (org_id, created_at DESC);