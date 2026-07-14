
-- Storage back-fill manifest table
CREATE TABLE IF NOT EXISTS public.storage_backfill_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bucket TEXT NOT NULL,
  old_name TEXT NOT NULL,
  new_name TEXT,
  op TEXT NOT NULL DEFAULT 'move' CHECK (op IN ('move','delete')),
  org_id UUID NOT NULL,
  is_orphan BOOLEAN NOT NULL DEFAULT false,
  db_rewrites JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','failed','skipped')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  dry_run_result JSONB,
  run_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bucket, old_name)
);

GRANT SELECT ON public.storage_backfill_log TO authenticated;
GRANT ALL ON public.storage_backfill_log TO service_role;

ALTER TABLE public.storage_backfill_log ENABLE ROW LEVEL SECURITY;

-- Admins can read the manifest to power the admin panel.
CREATE POLICY "Admins can view backfill log"
ON public.storage_backfill_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Writes are service-role only (edge function). No policy for authenticated INSERT/UPDATE/DELETE.

CREATE INDEX IF NOT EXISTS storage_backfill_log_bucket_status_idx
  ON public.storage_backfill_log (bucket, status);
CREATE INDEX IF NOT EXISTS storage_backfill_log_bucket_orphan_idx
  ON public.storage_backfill_log (bucket, is_orphan);

-- updated_at trigger (reuse existing helper if present, otherwise create local)
CREATE OR REPLACE FUNCTION public.tg_storage_backfill_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS storage_backfill_log_set_updated_at ON public.storage_backfill_log;
CREATE TRIGGER storage_backfill_log_set_updated_at
BEFORE UPDATE ON public.storage_backfill_log
FOR EACH ROW EXECUTE FUNCTION public.tg_storage_backfill_log_updated_at();

-- Atomic DB rewrite helper: reads one manifest row and applies every entry in db_rewrites
-- inside a single transaction. Each rewrite is a guarded UPDATE:
--   { "table": "submissions", "row_id": "<uuid>", "column": "file_url",
--     "old_value": "...", "new_value": "...", "json_path": null }
-- If json_path is provided, jsonb_set is used at that path (array of string keys).
-- Returns the number of DB rows actually updated. Raises on unknown table/column
-- so a broken manifest fails loudly rather than silently.
CREATE OR REPLACE FUNCTION public.apply_backfill_rewrites(_row_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rewrites JSONB;
  _r JSONB;
  _table TEXT;
  _column TEXT;
  _target_id TEXT;
  _old TEXT;
  _new TEXT;
  _json_path TEXT[];
  _sql TEXT;
  _updated INT := 0;
  _row_updated INT;
  _allowed_tables TEXT[] := ARRAY[
    'submissions','job_documents','customer_documents','customer_paperwork',
    'job_signatures','engineer_signatures','engineer_documents','asset_documents',
    'rams_documents','conformity_certificates','site_survey_photos',
    'job_site_survey_photos','paper_scan_batch_items','field_reports','job_messages',
    'job_sheet_responses'
  ];
  _allowed_columns TEXT[] := ARRAY[
    'file_url','file_path','pdf_url','word_url','photo_url','content','responses','raw_ocr','message_body'
  ];
BEGIN
  SELECT db_rewrites INTO _rewrites
  FROM public.storage_backfill_log
  WHERE id = _row_id
  FOR UPDATE;

  IF _rewrites IS NULL OR jsonb_array_length(_rewrites) = 0 THEN
    RETURN 0;
  END IF;

  FOR _r IN SELECT * FROM jsonb_array_elements(_rewrites)
  LOOP
    _table := _r->>'table';
    _column := _r->>'column';
    _target_id := _r->>'row_id';
    _old := _r->>'old_value';
    _new := _r->>'new_value';

    IF NOT (_table = ANY(_allowed_tables)) THEN
      RAISE EXCEPTION 'apply_backfill_rewrites: table % not allowed', _table;
    END IF;
    IF NOT (_column = ANY(_allowed_columns)) THEN
      RAISE EXCEPTION 'apply_backfill_rewrites: column % not allowed', _column;
    END IF;

    IF _r ? 'json_path' AND jsonb_typeof(_r->'json_path') = 'array' THEN
      SELECT array_agg(value::text) INTO _json_path
      FROM jsonb_array_elements_text(_r->'json_path');

      -- Guarded jsonb rewrite: only touch the row if the nested value still matches.
      _sql := format(
        'UPDATE public.%I SET %I = jsonb_set(%I, $1, to_jsonb($2::text), false) '
        'WHERE id = $3::uuid AND %I #>> $1 = $4',
        _table, _column, _column, _column
      );
      EXECUTE _sql USING _json_path, _new, _target_id, _old;
    ELSE
      -- Plain text column guarded update (position() covers embedded substrings for content fields).
      IF _column IN ('content','message_body') THEN
        _sql := format(
          'UPDATE public.%I SET %I = replace(%I, $1, $2) '
          'WHERE id = $3::uuid AND position($1 in %I) > 0',
          _table, _column, _column, _column
        );
        EXECUTE _sql USING _old, _new, _target_id;
      ELSE
        _sql := format(
          'UPDATE public.%I SET %I = $2 WHERE id = $3::uuid AND %I = $1',
          _table, _column, _column
        );
        EXECUTE _sql USING _old, _new, _target_id;
      END IF;
    END IF;

    GET DIAGNOSTICS _row_updated = ROW_COUNT;
    _updated := _updated + _row_updated;
  END LOOP;

  RETURN _updated;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_backfill_rewrites(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_backfill_rewrites(UUID) TO service_role;
