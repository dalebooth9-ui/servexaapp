-- Bulk paper scan batches: two tables to queue and review bulk-scanned paper job sheets.

CREATE TABLE public.paper_scan_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  created_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  total_items int NOT NULL DEFAULT 0,
  processed_items int NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paper_scan_batches TO authenticated;
GRANT ALL ON public.paper_scan_batches TO service_role;

ALTER TABLE public.paper_scan_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage paper scan batches in their org"
  ON public.paper_scan_batches FOR ALL
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE TABLE public.paper_scan_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.paper_scan_batches(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  image_paths text[] NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | processing | ready | low_confidence | failed | confirmed | rejected
  confidence numeric,
  detected_template_id uuid,
  candidate_matches jsonb,
  extracted jsonb,
  header_data jsonb,
  guess_customer_id uuid,
  guess_site_id uuid,
  guess_date date,
  error text,
  created_job_id uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_paper_scan_items_batch ON public.paper_scan_batch_items(batch_id);
CREATE INDEX idx_paper_scan_items_status ON public.paper_scan_batch_items(org_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paper_scan_batch_items TO authenticated;
GRANT ALL ON public.paper_scan_batch_items TO service_role;

ALTER TABLE public.paper_scan_batch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage paper scan items in their org"
  ON public.paper_scan_batch_items FOR ALL
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role))
  WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), org_id, 'admin'::app_role));

CREATE TRIGGER update_paper_scan_batches_updated_at
  BEFORE UPDATE ON public.paper_scan_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_paper_scan_batch_items_updated_at
  BEFORE UPDATE ON public.paper_scan_batch_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.paper_scan_batches REPLICA IDENTITY FULL;
ALTER TABLE public.paper_scan_batch_items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.paper_scan_batches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.paper_scan_batch_items;