
-- Time clock entries for engineers
CREATE TABLE public.time_clock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  clock_in_at timestamptz NOT NULL DEFAULT now(),
  clock_out_at timestamptz,
  clock_in_lat double precision,
  clock_in_lng double precision,
  clock_out_lat double precision,
  clock_out_lng double precision,
  total_minutes numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.time_clock ENABLE ROW LEVEL SECURITY;

-- Engineers can manage their own clock entries
CREATE POLICY "Engineers can insert own clock entries"
  ON public.time_clock FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Engineers can update own clock entries"
  ON public.time_clock FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Engineers can view own clock entries"
  ON public.time_clock FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can see all clock entries
CREATE POLICY "Admins can manage all clock entries"
  ON public.time_clock FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Index for quick lookups
CREATE INDEX idx_time_clock_user_date ON public.time_clock (user_id, clock_in_at);
