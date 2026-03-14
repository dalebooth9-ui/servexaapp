
CREATE TABLE IF NOT EXISTS public.bank_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'england-wales',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view bank holidays"
  ON public.bank_holidays FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage bank holidays"
  ON public.bank_holidays FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
