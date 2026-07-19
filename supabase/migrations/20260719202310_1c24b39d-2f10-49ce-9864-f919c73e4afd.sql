-- Track office-side amendments to submitted job sheet responses
ALTER TABLE public.job_sheet_responses
  ADD COLUMN IF NOT EXISTS last_amended_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_amended_by uuid REFERENCES auth.users(id);

CREATE TABLE IF NOT EXISTS public.job_sheet_response_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.job_sheet_responses(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  editor_id uuid NOT NULL REFERENCES auth.users(id),
  field_id text NOT NULL,
  field_label text,
  old_value jsonb,
  new_value jsonb,
  was_signed_at_time boolean NOT NULL DEFAULT false,
  edited_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jsre_response ON public.job_sheet_response_edits(response_id);
CREATE INDEX IF NOT EXISTS idx_jsre_job ON public.job_sheet_response_edits(job_id);

GRANT SELECT, INSERT ON public.job_sheet_response_edits TO authenticated;
GRANT ALL ON public.job_sheet_response_edits TO service_role;

ALTER TABLE public.job_sheet_response_edits ENABLE ROW LEVEL SECURITY;

-- Admins in the owning org can read edits for jobs in their org; engineers can read edits on jobs they're assigned to.
CREATE POLICY "Read edits for accessible jobs"
ON public.job_sheet_response_edits
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_sheet_response_edits.job_id
      AND (
        public.has_role_in_org(auth.uid(), j.org_id, 'admin')
        OR EXISTS (
          SELECT 1 FROM public.job_assignments ja
          WHERE ja.job_id = j.id AND ja.engineer_id = auth.uid()
        )
      )
  )
);

-- Only admins in the job's org may insert edit-log rows; editor_id must be the caller.
CREATE POLICY "Admins log their own edits"
ON public.job_sheet_response_edits
FOR INSERT
TO authenticated
WITH CHECK (
  editor_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_sheet_response_edits.job_id
      AND public.has_role_in_org(auth.uid(), j.org_id, 'admin')
  )
);