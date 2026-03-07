-- Snag revision history table
CREATE TABLE IF NOT EXISTS public.installation_issue_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  field text NOT NULL,
  old_value text,
  new_value text
);

ALTER TABLE public.installation_issue_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage issue history"
  ON public.installation_issue_history FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view issue history for assigned jobs"
  ON public.installation_issue_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM installation_issues ii
      JOIN installation_projects p ON p.id = ii.project_id
      JOIN job_assignments ja ON ja.job_id = p.job_id
      WHERE ii.id = installation_issue_history.issue_id
        AND ja.engineer_id = auth.uid()
    )
  );

CREATE POLICY "Engineers can insert issue history for assigned jobs"
  ON public.installation_issue_history FOR INSERT
  TO authenticated
  WITH CHECK (
    changed_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM installation_issues ii
      JOIN installation_projects p ON p.id = ii.project_id
      JOIN job_assignments ja ON ja.job_id = p.job_id
      WHERE ii.id = installation_issue_history.issue_id
        AND ja.engineer_id = auth.uid()
    )
  );

-- Handover sign-off tokens
CREATE TABLE IF NOT EXISTS public.installation_handover_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  job_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  client_name text NOT NULL DEFAULT '',
  client_email text,
  signed_at timestamptz,
  signature_data text,
  status text NOT NULL DEFAULT 'pending'
);

ALTER TABLE public.installation_handover_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage handover tokens"
  ON public.installation_handover_tokens FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can manage handover tokens for assigned jobs"
  ON public.installation_handover_tokens FOR ALL
  TO authenticated
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM job_assignments ja
      WHERE ja.job_id = installation_handover_tokens.job_id
        AND ja.engineer_id = auth.uid()
    )
  )
  WITH CHECK (
    created_by = auth.uid()
  );