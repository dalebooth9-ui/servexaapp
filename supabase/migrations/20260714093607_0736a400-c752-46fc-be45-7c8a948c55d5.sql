
CREATE TABLE public.engineer_signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engineer_signatures TO authenticated;
GRANT ALL ON public.engineer_signatures TO service_role;

ALTER TABLE public.engineer_signatures ENABLE ROW LEVEL SECURITY;

-- Admins in the org can fully manage
CREATE POLICY "Admins manage engineer_signatures"
ON public.engineer_signatures
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND org_id = (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND org_id = (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
);

-- Any authenticated org member can read (needed by the PDF renderer)
CREATE POLICY "Org members read engineer_signatures"
ON public.engineer_signatures
FOR SELECT
TO authenticated
USING (
  org_id = (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
);

-- Auto-stamp org_id from the caller's profile (matches the trigger sweep pattern)
CREATE TRIGGER engineer_signatures_stamp_org_id
BEFORE INSERT ON public.engineer_signatures
FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();

CREATE TRIGGER engineer_signatures_updated_at
BEFORE UPDATE ON public.engineer_signatures
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
