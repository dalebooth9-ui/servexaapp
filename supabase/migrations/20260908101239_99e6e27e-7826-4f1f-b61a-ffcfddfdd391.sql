CREATE TABLE public.ai_data_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  question_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, usage_date)
);

GRANT SELECT ON public.ai_data_usage TO authenticated;
GRANT ALL ON public.ai_data_usage TO service_role;

ALTER TABLE public.ai_data_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their org AI usage"
ON public.ai_data_usage FOR SELECT TO authenticated
USING (org_id = public.get_user_org_id());