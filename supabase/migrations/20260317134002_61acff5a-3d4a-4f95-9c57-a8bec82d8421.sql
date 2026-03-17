
-- Add a soft-delete / blocked references table for The Mellor (Quote Hound) imports
CREATE TABLE IF NOT EXISTS public.mellor_deleted_references (
  reference_number TEXT PRIMARY KEY,
  deleted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.mellor_deleted_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage mellor deleted refs"
  ON public.mellor_deleted_references
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
