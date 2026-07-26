
-- Helper: is a job_documents.document_type visible to engineers?
-- Defaults hide commercial paperwork. Admins can override the hidden list by
-- writing a JSON array under app_settings.key = 'engineer_hidden_document_types'.
CREATE OR REPLACE FUNCTION public.is_engineer_visible_document_type(_document_type text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  override_val jsonb;
  hidden text[];
BEGIN
  IF _document_type IS NULL THEN
    RETURN true;
  END IF;

  SELECT value INTO override_val
  FROM public.app_settings
  WHERE key = 'engineer_hidden_document_types'
  LIMIT 1;

  IF override_val IS NOT NULL AND jsonb_typeof(override_val) = 'array' THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(override_val)) INTO hidden;
  ELSE
    hidden := ARRAY['quote', 'purchase_order', 'invoice', 'contract', 'costing_sheet'];
  END IF;

  RETURN NOT (_document_type = ANY(hidden));
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_engineer_visible_document_type(text)
  TO authenticated, service_role;

-- Tighten the engineer SELECT policy so commercial docs never reach engineers.
DROP POLICY IF EXISTS "Engineers can view job documents for their jobs"
  ON public.job_documents;

CREATE POLICY "Engineers can view job documents for their jobs"
  ON public.job_documents
  FOR SELECT
  USING (
    public.is_engineer_visible_document_type(document_type)
    AND (
      EXISTS (SELECT 1 FROM public.job_assignments ja
                WHERE ja.job_id = job_documents.job_id AND ja.engineer_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.job_schedule js
                   WHERE js.job_id = job_documents.job_id AND js.engineer_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.job_visits jv
                   WHERE jv.job_id = job_documents.job_id AND jv.engineer_id = auth.uid())
    )
  );
