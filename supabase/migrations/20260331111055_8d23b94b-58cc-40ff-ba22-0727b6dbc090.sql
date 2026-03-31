
-- Per-engineer page access control
CREATE TABLE public.engineer_page_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, page_slug)
);

ALTER TABLE public.engineer_page_access ENABLE ROW LEVEL SECURITY;

-- Admins can manage all access records
CREATE POLICY "Admins can manage engineer page access"
ON public.engineer_page_access FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Engineers can read their own access records
CREATE POLICY "Engineers can read own page access"
ON public.engineer_page_access FOR SELECT
TO authenticated
USING (user_id = auth.uid());
