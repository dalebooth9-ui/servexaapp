
CREATE OR REPLACE FUNCTION public.build_backfill_manifest(_bucket TEXT)
RETURNS TABLE (inserted INT, skipped INT, orphans INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _viva UUID := '11111111-1111-1111-1111-111111111111';
  _obj RECORD;
  _old TEXT;
  _new TEXT;
  _org UUID;
  _rewrites JSONB;
  _r RECORD;
  _bare TEXT;
  _durable TEXT;
  _url_public TEXT;
  _url_sign_prefix TEXT;
  _first_seg TEXT;
  _is_org_prefixed BOOLEAN;
  _inserted INT := 0;
  _skipped INT := 0;
  _orphans INT := 0;
BEGIN
  FOR _obj IN SELECT name FROM storage.objects WHERE bucket_id = _bucket
  LOOP
    _old := _obj.name;
    IF _old IS NULL OR _old = '' THEN CONTINUE; END IF;

    _first_seg := split_part(_old, '/', 1);
    _is_org_prefixed := false;
    IF _first_seg ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       AND EXISTS (SELECT 1 FROM public.organisations WHERE id = _first_seg::uuid)
    THEN
      _is_org_prefixed := true;
    END IF;

    IF _is_org_prefixed THEN
      INSERT INTO public.storage_backfill_log (bucket, old_name, new_name, op, org_id, is_orphan, db_rewrites, status)
      VALUES (_bucket, _old, _old, 'move', _first_seg::uuid, false, '[]'::jsonb, 'skipped')
      ON CONFLICT (bucket, old_name) DO UPDATE
        SET status = CASE WHEN storage_backfill_log.status IN ('done','failed','in_progress') THEN storage_backfill_log.status ELSE 'skipped' END,
            org_id = EXCLUDED.org_id, updated_at = now();
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    IF _bucket = 'blank-template-pdfs' THEN
      INSERT INTO public.storage_backfill_log (bucket, old_name, new_name, op, org_id, is_orphan, db_rewrites, status)
      VALUES (_bucket, _old, NULL, 'delete', _viva, true, '[]'::jsonb, 'pending')
      ON CONFLICT (bucket, old_name) DO UPDATE
        SET status = CASE WHEN storage_backfill_log.status IN ('done','failed','in_progress') THEN storage_backfill_log.status ELSE 'pending' END, updated_at = now();
      _inserted := _inserted + 1;
      CONTINUE;
    END IF;

    _bare := _old;
    _durable := 'storage://' || _bucket || '/' || _old;
    _url_public := '/object/public/' || _bucket || '/' || _old;
    _url_sign_prefix := '/object/sign/' || _bucket || '/' || _old;
    _rewrites := '[]'::jsonb;
    _org := NULL;

    -- submissions.file_url
    FOR _r IN
      SELECT s.id, s.file_url, s.org_id AS org
      FROM public.submissions s
      WHERE s.file_url = _bare OR s.file_url = _durable
         OR position(_url_public in coalesce(s.file_url,'')) > 0
         OR position(_url_sign_prefix in coalesce(s.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','submissions','row_id',_r.id,'column','file_url','old_value',_r.file_url,'new_value','__PLACEHOLDER__');
    END LOOP;

    -- job_documents.file_url
    FOR _r IN
      SELECT jd.id, jd.file_url, jd.org_id AS org
      FROM public.job_documents jd
      WHERE jd.file_url = _bare OR jd.file_url = _durable
         OR position(_url_public in coalesce(jd.file_url,'')) > 0
         OR position(_url_sign_prefix in coalesce(jd.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','job_documents','row_id',_r.id,'column','file_url','old_value',_r.file_url,'new_value','__PLACEHOLDER__');
    END LOOP;

    -- customer_documents.file_url via customers
    FOR _r IN
      SELECT cd.id, cd.file_url, c.org_id AS org
      FROM public.customer_documents cd
      LEFT JOIN public.customers c ON c.id = cd.customer_id
      WHERE cd.file_url = _bare OR cd.file_url = _durable
         OR position(_url_public in coalesce(cd.file_url,'')) > 0
         OR position(_url_sign_prefix in coalesce(cd.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','customer_documents','row_id',_r.id,'column','file_url','old_value',_r.file_url,'new_value','__PLACEHOLDER__');
    END LOOP;

    -- customer_paperwork.file_url via customers
    FOR _r IN
      SELECT cp.id, cp.file_url, c.org_id AS org
      FROM public.customer_paperwork cp
      LEFT JOIN public.customers c ON c.id = cp.customer_id
      WHERE cp.file_url = _bare OR cp.file_url = _durable
         OR position(_url_public in coalesce(cp.file_url,'')) > 0
         OR position(_url_sign_prefix in coalesce(cp.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','customer_paperwork','row_id',_r.id,'column','file_url','old_value',_r.file_url,'new_value','__PLACEHOLDER__');
    END LOOP;

    -- job_signatures.file_path
    FOR _r IN
      SELECT js.id, js.file_path, js.org_id AS org
      FROM public.job_signatures js
      WHERE js.file_path = _bare OR js.file_path = _durable
         OR position(_url_public in coalesce(js.file_path,'')) > 0
         OR position(_url_sign_prefix in coalesce(js.file_path,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','job_signatures','row_id',_r.id,'column','file_path','old_value',_r.file_path,'new_value','__PLACEHOLDER__');
    END LOOP;

    -- engineer_signatures.file_path
    FOR _r IN
      SELECT es.id, es.file_path, es.org_id AS org
      FROM public.engineer_signatures es
      WHERE es.file_path = _bare OR es.file_path = _durable
         OR position(_url_public in coalesce(es.file_path,'')) > 0
         OR position(_url_sign_prefix in coalesce(es.file_path,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','engineer_signatures','row_id',_r.id,'column','file_path','old_value',_r.file_path,'new_value','__PLACEHOLDER__');
    END LOOP;

    -- engineer_documents.file_url (own org_id)
    FOR _r IN
      SELECT ed.id, ed.file_url, ed.org_id AS org
      FROM public.engineer_documents ed
      WHERE ed.file_url = _bare OR ed.file_url = _durable
         OR position(_url_public in coalesce(ed.file_url,'')) > 0
         OR position(_url_sign_prefix in coalesce(ed.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','engineer_documents','row_id',_r.id,'column','file_url','old_value',_r.file_url,'new_value','__PLACEHOLDER__');
    END LOOP;

    -- asset_documents.file_url via assets
    FOR _r IN
      SELECT ad.id, ad.file_url, a.org_id AS org
      FROM public.asset_documents ad
      LEFT JOIN public.assets a ON a.id = ad.asset_id
      WHERE ad.file_url = _bare OR ad.file_url = _durable
         OR position(_url_public in coalesce(ad.file_url,'')) > 0
         OR position(_url_sign_prefix in coalesce(ad.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','asset_documents','row_id',_r.id,'column','file_url','old_value',_r.file_url,'new_value','__PLACEHOLDER__');
    END LOOP;

    -- site_survey_photos.file_path (own org_id)
    FOR _r IN
      SELECT sp.id, sp.file_path, sp.org_id AS org
      FROM public.site_survey_photos sp
      WHERE sp.file_path = _bare OR sp.file_path = _durable
         OR position(_url_public in coalesce(sp.file_path,'')) > 0
         OR position(_url_sign_prefix in coalesce(sp.file_path,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','site_survey_photos','row_id',_r.id,'column','file_path','old_value',_r.file_path,'new_value','__PLACEHOLDER__');
    END LOOP;

    -- job_site_survey_photos.file_path (own org_id)
    FOR _r IN
      SELECT jsp.id, jsp.file_path, jsp.org_id AS org
      FROM public.job_site_survey_photos jsp
      WHERE jsp.file_path = _bare OR jsp.file_path = _durable
         OR position(_url_public in coalesce(jsp.file_path,'')) > 0
         OR position(_url_sign_prefix in coalesce(jsp.file_path,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','job_site_survey_photos','row_id',_r.id,'column','file_path','old_value',_r.file_path,'new_value','__PLACEHOLDER__');
    END LOOP;

    -- paper_scan_batch_items.image_paths (text[]) — array contains the old path
    FOR _r IN
      SELECT pi.id, pi.image_paths, pi.org_id AS org
      FROM public.paper_scan_batch_items pi
      WHERE _bare = ANY(pi.image_paths)
         OR _durable = ANY(pi.image_paths)
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','paper_scan_batch_items','row_id',_r.id,'column','image_paths','old_value',_bare,'new_value','__PLACEHOLDER__','array_element',true);
    END LOOP;

    -- job_sheet_responses.responses (jsonb substring)
    FOR _r IN
      SELECT jsr.id, jsr.org_id AS org
      FROM public.job_sheet_responses jsr
      WHERE position(_bare in coalesce(jsr.responses::text,'')) > 0
         OR position(_url_public in coalesce(jsr.responses::text,'')) > 0
         OR position(_url_sign_prefix in coalesce(jsr.responses::text,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','job_sheet_responses','row_id',_r.id,'column','responses','old_value',_old,'new_value','__PLACEHOLDER__','jsonb_substring',true);
    END LOOP;

    -- field_reports.content substring
    FOR _r IN
      SELECT fr.id, fr.org_id AS org
      FROM public.field_reports fr
      WHERE position(_bare in coalesce(fr.content,'')) > 0
         OR position(_url_public in coalesce(fr.content,'')) > 0
         OR position(_url_sign_prefix in coalesce(fr.content,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','field_reports','row_id',_r.id,'column','content','old_value',_old,'new_value','__PLACEHOLDER__');
    END LOOP;

    -- job_messages.content substring
    FOR _r IN
      SELECT jm.id, jm.org_id AS org
      FROM public.job_messages jm
      WHERE position(_bare in coalesce(jm.content,'')) > 0
         OR position(_url_public in coalesce(jm.content,'')) > 0
         OR position(_url_sign_prefix in coalesce(jm.content,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','job_messages','row_id',_r.id,'column','content','old_value',_old,'new_value','__PLACEHOLDER__');
    END LOOP;

    IF _org IS NULL THEN
      _org := _viva;
      _orphans := _orphans + 1;
    END IF;

    _new := _org::text || '/' || _old;

    _rewrites := (
      SELECT COALESCE(jsonb_agg(
        CASE
          WHEN r->>'column' = 'content' THEN
            r - 'new_value' || jsonb_build_object('new_value', replace(r->>'old_value', _old, _new))
          WHEN (r->>'jsonb_substring')::boolean IS TRUE THEN
            r - 'new_value' || jsonb_build_object('new_value', _new)
          WHEN (r->>'array_element')::boolean IS TRUE THEN
            r - 'new_value' || jsonb_build_object('new_value', _new)
          ELSE
            r - 'new_value' || jsonb_build_object('new_value',
              CASE
                WHEN r->>'old_value' = _bare THEN _new
                WHEN r->>'old_value' = _durable THEN 'storage://'||_bucket||'/'||_new
                ELSE replace(r->>'old_value', _old, _new)
              END)
        END
      ), '[]'::jsonb)
      FROM jsonb_array_elements(_rewrites) r
    );

    INSERT INTO public.storage_backfill_log (bucket, old_name, new_name, op, org_id, is_orphan, db_rewrites, status)
    VALUES (_bucket, _old, _new, 'move', _org, (jsonb_array_length(_rewrites) = 0), _rewrites, 'pending')
    ON CONFLICT (bucket, old_name) DO UPDATE
      SET new_name = EXCLUDED.new_name,
          org_id = EXCLUDED.org_id,
          is_orphan = EXCLUDED.is_orphan,
          db_rewrites = EXCLUDED.db_rewrites,
          status = CASE WHEN storage_backfill_log.status IN ('done','failed','in_progress') THEN storage_backfill_log.status ELSE 'pending' END,
          updated_at = now();
    _inserted := _inserted + 1;
  END LOOP;

  RETURN QUERY SELECT _inserted, _skipped, _orphans;
END;
$$;

REVOKE ALL ON FUNCTION public.build_backfill_manifest(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.build_backfill_manifest(TEXT) TO service_role;

-- Update apply_backfill_rewrites: correct allowed columns/tables, handle array_element for image_paths.
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
  _sql TEXT;
  _updated INT := 0;
  _row_updated INT;
  _allowed_tables TEXT[] := ARRAY[
    'submissions','job_documents','customer_documents','customer_paperwork',
    'job_signatures','engineer_signatures','engineer_documents','asset_documents',
    'site_survey_photos','job_site_survey_photos','paper_scan_batch_items',
    'field_reports','job_messages','job_sheet_responses'
  ];
  _allowed_columns TEXT[] := ARRAY[
    'file_url','file_path','content','responses','image_paths'
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

    IF (_r->>'array_element')::boolean IS TRUE THEN
      -- text[] element replacement
      _sql := format(
        'UPDATE public.%I SET %I = array_replace(%I, $1, $2) WHERE id = $3::uuid AND $1 = ANY(%I)',
        _table, _column, _column, _column
      );
      EXECUTE _sql USING _old, _new, _target_id;
    ELSIF (_r->>'jsonb_substring')::boolean IS TRUE THEN
      _sql := format(
        'UPDATE public.%I SET %I = replace(%I::text, $1, $2)::jsonb WHERE id = $3::uuid AND position($1 in %I::text) > 0',
        _table, _column, _column, _column
      );
      EXECUTE _sql USING _old, _new, _target_id;
    ELSIF _column = 'content' THEN
      _sql := format(
        'UPDATE public.%I SET %I = replace(%I, $1, $2) WHERE id = $3::uuid AND position($1 in %I) > 0',
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

    GET DIAGNOSTICS _row_updated = ROW_COUNT;
    _updated := _updated + _row_updated;
  END LOOP;

  RETURN _updated;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_backfill_rewrites(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_backfill_rewrites(UUID) TO service_role;

-- Reset stale prep rows so re-prepare rebuilds them cleanly.
DELETE FROM public.storage_backfill_log WHERE status IN ('pending','skipped');
