
-- ============================================================================
-- Stage B: manifest builder
-- ============================================================================
-- Builds one row per storage object into storage_backfill_log with:
--   - target new_name = "<org_id>/<old_name>" (org-prefixed)
--   - org attribution: whichever DB row references it (via jobs/customers/etc);
--     else Viva Fire (11111111-1111-1111-1111-111111111111).
--   - db_rewrites: array of {table, row_id, column, old_value, new_value}.
--
-- Idempotent via UNIQUE (bucket, old_name).
-- Handles 3 ref shapes: bare path, storage://bucket/path, and
-- /object/(public|sign)/bucket/path URLs.
-- ============================================================================

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
  _add JSONB;
  _r RECORD;
  _bare TEXT;
  _durable TEXT;
  _url_public TEXT;
  _url_sign_prefix TEXT;
  _uuid_re TEXT := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/';
  _inserted INT := 0;
  _skipped INT := 0;
  _orphans INT := 0;
  _op TEXT;
BEGIN
  FOR _obj IN
    SELECT name FROM storage.objects WHERE bucket_id = _bucket
  LOOP
    _old := _obj.name;
    IF _old IS NULL OR _old = '' THEN CONTINUE; END IF;

    -- Skip already-prefixed objects (idempotency).
    IF _old ~ _uuid_re THEN
      INSERT INTO public.storage_backfill_log (bucket, old_name, new_name, op, org_id, is_orphan, db_rewrites, status)
      VALUES (_bucket, _old, _old, 'move', substring(_old from 1 for 36)::uuid, false, '[]'::jsonb, 'skipped')
      ON CONFLICT (bucket, old_name) DO NOTHING;
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    -- blank-template-pdfs: single stale cache → delete
    IF _bucket = 'blank-template-pdfs' THEN
      INSERT INTO public.storage_backfill_log (bucket, old_name, new_name, op, org_id, is_orphan, db_rewrites, status)
      VALUES (_bucket, _old, NULL, 'delete', _viva, true, '[]'::jsonb, 'pending')
      ON CONFLICT (bucket, old_name) DO NOTHING;
      _inserted := _inserted + 1;
      CONTINUE;
    END IF;

    _new := _viva::text || '/' || _old;
    _bare := _old;
    _durable := 'storage://' || _bucket || '/' || _old;
    _url_public := '/object/public/' || _bucket || '/' || _old;
    _url_sign_prefix := '/object/sign/' || _bucket || '/' || _old;

    _rewrites := '[]'::jsonb;
    _org := NULL;

    -- Helper macro: for each candidate table/column, look for rows containing any of the 3 ref shapes.
    -- We match text columns with equality (bare/durable) OR substring (URL forms).

    -- submissions.file_url  → jobs.org_id
    FOR _r IN
      SELECT s.id, s.file_url, j.org_id AS org
      FROM public.submissions s
      LEFT JOIN public.jobs j ON j.id = s.job_id
      WHERE s.file_url = _bare
         OR s.file_url = _durable
         OR position(_url_public in coalesce(s.file_url,'')) > 0
         OR position(_url_sign_prefix in coalesce(s.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _add := jsonb_build_object(
        'table','submissions','row_id',_r.id,'column','file_url',
        'old_value', _r.file_url,
        'new_value', CASE
          WHEN _r.file_url = _bare THEN _new
          WHEN _r.file_url = _durable THEN 'storage://' || _bucket || '/' || _new
          ELSE replace(_r.file_url, _old, _new)
        END
      );
      _rewrites := _rewrites || _add;
    END LOOP;

    -- job_documents.file_url → jobs.org_id
    FOR _r IN
      SELECT jd.id, jd.file_url, j.org_id AS org
      FROM public.job_documents jd
      LEFT JOIN public.jobs j ON j.id = jd.job_id
      WHERE jd.file_url = _bare OR jd.file_url = _durable
         OR position(_url_public in coalesce(jd.file_url,'')) > 0
         OR position(_url_sign_prefix in coalesce(jd.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _add := jsonb_build_object('table','job_documents','row_id',_r.id,'column','file_url',
        'old_value',_r.file_url,
        'new_value', CASE WHEN _r.file_url = _bare THEN _new WHEN _r.file_url = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.file_url,_old,_new) END);
      _rewrites := _rewrites || _add;
    END LOOP;

    -- customer_documents.file_url → customers.org_id
    FOR _r IN
      SELECT cd.id, cd.file_url, c.org_id AS org
      FROM public.customer_documents cd
      LEFT JOIN public.customers c ON c.id = cd.customer_id
      WHERE cd.file_url = _bare OR cd.file_url = _durable
         OR position(_url_public in coalesce(cd.file_url,'')) > 0
         OR position(_url_sign_prefix in coalesce(cd.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _add := jsonb_build_object('table','customer_documents','row_id',_r.id,'column','file_url',
        'old_value',_r.file_url,
        'new_value', CASE WHEN _r.file_url = _bare THEN _new WHEN _r.file_url = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.file_url,_old,_new) END);
      _rewrites := _rewrites || _add;
    END LOOP;

    -- customer_paperwork.file_url → customers.org_id
    FOR _r IN
      SELECT cp.id, cp.file_url, c.org_id AS org
      FROM public.customer_paperwork cp
      LEFT JOIN public.customers c ON c.id = cp.customer_id
      WHERE cp.file_url = _bare OR cp.file_url = _durable
         OR position(_url_public in coalesce(cp.file_url,'')) > 0
         OR position(_url_sign_prefix in coalesce(cp.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _add := jsonb_build_object('table','customer_paperwork','row_id',_r.id,'column','file_url',
        'old_value',_r.file_url,
        'new_value', CASE WHEN _r.file_url = _bare THEN _new WHEN _r.file_url = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.file_url,_old,_new) END);
      _rewrites := _rewrites || _add;
    END LOOP;

    -- job_signatures.file_path → jobs.org_id
    FOR _r IN
      SELECT js.id, js.file_path, j.org_id AS org
      FROM public.job_signatures js
      LEFT JOIN public.jobs j ON j.id = js.job_id
      WHERE js.file_path = _bare OR js.file_path = _durable
         OR position(_url_public in coalesce(js.file_path,'')) > 0
         OR position(_url_sign_prefix in coalesce(js.file_path,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _add := jsonb_build_object('table','job_signatures','row_id',_r.id,'column','file_path',
        'old_value',_r.file_path,
        'new_value', CASE WHEN _r.file_path = _bare THEN _new WHEN _r.file_path = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.file_path,_old,_new) END);
      _rewrites := _rewrites || _add;
    END LOOP;

    -- engineer_signatures.file_path → profiles.org_id
    FOR _r IN
      SELECT es.id, es.file_path, p.org_id AS org
      FROM public.engineer_signatures es
      LEFT JOIN public.profiles p ON p.user_id = es.user_id
      WHERE es.file_path = _bare OR es.file_path = _durable
         OR position(_url_public in coalesce(es.file_path,'')) > 0
         OR position(_url_sign_prefix in coalesce(es.file_path,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _add := jsonb_build_object('table','engineer_signatures','row_id',_r.id,'column','file_path',
        'old_value',_r.file_path,
        'new_value', CASE WHEN es.file_path = _bare THEN _new WHEN _r.file_path = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.file_path,_old,_new) END);
      _rewrites := _rewrites || _add;
    END LOOP;

    -- engineer_documents.file_url → profiles.org_id
    FOR _r IN
      SELECT ed.id, ed.file_url, p.org_id AS org
      FROM public.engineer_documents ed
      LEFT JOIN public.profiles p ON p.user_id = ed.user_id
      WHERE ed.file_url = _bare OR ed.file_url = _durable
         OR position(_url_public in coalesce(ed.file_url,'')) > 0
         OR position(_url_sign_prefix in coalesce(ed.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _add := jsonb_build_object('table','engineer_documents','row_id',_r.id,'column','file_url',
        'old_value',_r.file_url,
        'new_value', CASE WHEN _r.file_url = _bare THEN _new WHEN _r.file_url = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.file_url,_old,_new) END);
      _rewrites := _rewrites || _add;
    END LOOP;

    -- asset_documents.file_url → assets.org_id
    FOR _r IN
      SELECT ad.id, ad.file_url, a.org_id AS org
      FROM public.asset_documents ad
      LEFT JOIN public.assets a ON a.id = ad.asset_id
      WHERE ad.file_url = _bare OR ad.file_url = _durable
         OR position(_url_public in coalesce(ad.file_url,'')) > 0
         OR position(_url_sign_prefix in coalesce(ad.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _add := jsonb_build_object('table','asset_documents','row_id',_r.id,'column','file_url',
        'old_value',_r.file_url,
        'new_value', CASE WHEN _r.file_url = _bare THEN _new WHEN _r.file_url = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.file_url,_old,_new) END);
      _rewrites := _rewrites || _add;
    END LOOP;

    -- rams_documents (pdf_url, word_url, file_url) → jobs.org_id
    FOR _r IN
      SELECT rd.id, rd.pdf_url, rd.word_url, rd.file_url, j.org_id AS org
      FROM public.rams_documents rd
      LEFT JOIN public.jobs j ON j.id = rd.job_id
      WHERE rd.pdf_url = _bare OR rd.pdf_url = _durable OR position(_url_public in coalesce(rd.pdf_url,'')) > 0 OR position(_url_sign_prefix in coalesce(rd.pdf_url,'')) > 0
         OR rd.word_url = _bare OR rd.word_url = _durable OR position(_url_public in coalesce(rd.word_url,'')) > 0 OR position(_url_sign_prefix in coalesce(rd.word_url,'')) > 0
         OR rd.file_url = _bare OR rd.file_url = _durable OR position(_url_public in coalesce(rd.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(rd.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      IF _r.pdf_url = _bare OR _r.pdf_url = _durable OR position(_url_public in coalesce(_r.pdf_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.pdf_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','rams_documents','row_id',_r.id,'column','pdf_url',
          'old_value',_r.pdf_url,'new_value', CASE WHEN _r.pdf_url = _bare THEN _new WHEN _r.pdf_url = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.pdf_url,_old,_new) END);
      END IF;
      IF _r.word_url = _bare OR _r.word_url = _durable OR position(_url_public in coalesce(_r.word_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.word_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','rams_documents','row_id',_r.id,'column','word_url',
          'old_value',_r.word_url,'new_value', CASE WHEN _r.word_url = _bare THEN _new WHEN _r.word_url = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.word_url,_old,_new) END);
      END IF;
      IF _r.file_url = _bare OR _r.file_url = _durable OR position(_url_public in coalesce(_r.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.file_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','rams_documents','row_id',_r.id,'column','file_url',
          'old_value',_r.file_url,'new_value', CASE WHEN _r.file_url = _bare THEN _new WHEN _r.file_url = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.file_url,_old,_new) END);
      END IF;
    END LOOP;

    -- conformity_certificates (pdf_url, file_url) → jobs.org_id
    FOR _r IN
      SELECT cc.id, cc.pdf_url, cc.file_url, j.org_id AS org
      FROM public.conformity_certificates cc
      LEFT JOIN public.jobs j ON j.id = cc.job_id
      WHERE cc.pdf_url = _bare OR cc.pdf_url = _durable OR position(_url_public in coalesce(cc.pdf_url,'')) > 0 OR position(_url_sign_prefix in coalesce(cc.pdf_url,'')) > 0
         OR cc.file_url = _bare OR cc.file_url = _durable OR position(_url_public in coalesce(cc.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(cc.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      IF _r.pdf_url = _bare OR _r.pdf_url = _durable OR position(_url_public in coalesce(_r.pdf_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.pdf_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','conformity_certificates','row_id',_r.id,'column','pdf_url',
          'old_value',_r.pdf_url,'new_value', CASE WHEN _r.pdf_url = _bare THEN _new WHEN _r.pdf_url = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.pdf_url,_old,_new) END);
      END IF;
      IF _r.file_url = _bare OR _r.file_url = _durable OR position(_url_public in coalesce(_r.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.file_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','conformity_certificates','row_id',_r.id,'column','file_url',
          'old_value',_r.file_url,'new_value', CASE WHEN _r.file_url = _bare THEN _new WHEN _r.file_url = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.file_url,_old,_new) END);
      END IF;
    END LOOP;

    -- site_survey_photos (photo_url, file_url) → site_surveys.org_id
    FOR _r IN
      SELECT sp.id, sp.photo_url, sp.file_url, ss.org_id AS org
      FROM public.site_survey_photos sp
      LEFT JOIN public.site_surveys ss ON ss.id = sp.site_survey_id
      WHERE sp.photo_url = _bare OR sp.photo_url = _durable OR position(_url_public in coalesce(sp.photo_url,'')) > 0 OR position(_url_sign_prefix in coalesce(sp.photo_url,'')) > 0
         OR sp.file_url = _bare OR sp.file_url = _durable OR position(_url_public in coalesce(sp.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(sp.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      IF _r.photo_url = _bare OR _r.photo_url = _durable OR position(_url_public in coalesce(_r.photo_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.photo_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','site_survey_photos','row_id',_r.id,'column','photo_url',
          'old_value',_r.photo_url,'new_value', CASE WHEN _r.photo_url = _bare THEN _new WHEN _r.photo_url = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.photo_url,_old,_new) END);
      END IF;
      IF _r.file_url = _bare OR _r.file_url = _durable OR position(_url_public in coalesce(_r.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.file_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','site_survey_photos','row_id',_r.id,'column','file_url',
          'old_value',_r.file_url,'new_value', CASE WHEN _r.file_url = _bare THEN _new WHEN _r.file_url = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.file_url,_old,_new) END);
      END IF;
    END LOOP;

    -- job_site_survey_photos (photo_url, file_url) → jobs.org_id
    FOR _r IN
      SELECT jsp.id, jsp.photo_url, jsp.file_url, j.org_id AS org
      FROM public.job_site_survey_photos jsp
      LEFT JOIN public.jobs j ON j.id = jsp.job_id
      WHERE jsp.photo_url = _bare OR jsp.photo_url = _durable OR position(_url_public in coalesce(jsp.photo_url,'')) > 0 OR position(_url_sign_prefix in coalesce(jsp.photo_url,'')) > 0
         OR jsp.file_url = _bare OR jsp.file_url = _durable OR position(_url_public in coalesce(jsp.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(jsp.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      IF _r.photo_url = _bare OR _r.photo_url = _durable OR position(_url_public in coalesce(_r.photo_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.photo_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','job_site_survey_photos','row_id',_r.id,'column','photo_url',
          'old_value',_r.photo_url,'new_value', CASE WHEN _r.photo_url = _bare THEN _new WHEN _r.photo_url = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.photo_url,_old,_new) END);
      END IF;
      IF _r.file_url = _bare OR _r.file_url = _durable OR position(_url_public in coalesce(_r.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.file_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','job_site_survey_photos','row_id',_r.id,'column','file_url',
          'old_value',_r.file_url,'new_value', CASE WHEN _r.file_url = _bare THEN _new WHEN _r.file_url = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.file_url,_old,_new) END);
      END IF;
    END LOOP;

    -- paper_scan_batch_items (file_url, pdf_url) → paper_scan_batches → best-effort via jobs
    FOR _r IN
      SELECT pi.id, pi.file_url, pi.pdf_url
      FROM public.paper_scan_batch_items pi
      WHERE pi.file_url = _bare OR pi.file_url = _durable OR position(_url_public in coalesce(pi.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(pi.file_url,'')) > 0
         OR pi.pdf_url  = _bare OR pi.pdf_url  = _durable OR position(_url_public in coalesce(pi.pdf_url,'')) > 0 OR position(_url_sign_prefix in coalesce(pi.pdf_url,'')) > 0
    LOOP
      IF _r.file_url = _bare OR _r.file_url = _durable OR position(_url_public in coalesce(_r.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.file_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','paper_scan_batch_items','row_id',_r.id,'column','file_url',
          'old_value',_r.file_url,'new_value', CASE WHEN _r.file_url = _bare THEN _new WHEN _r.file_url = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.file_url,_old,_new) END);
      END IF;
      IF _r.pdf_url = _bare OR _r.pdf_url = _durable OR position(_url_public in coalesce(_r.pdf_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.pdf_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','paper_scan_batch_items','row_id',_r.id,'column','pdf_url',
          'old_value',_r.pdf_url,'new_value', CASE WHEN _r.pdf_url = _bare THEN _new WHEN _r.pdf_url = _durable THEN 'storage://'||_bucket||'/'||_new ELSE replace(_r.pdf_url,_old,_new) END);
      END IF;
    END LOOP;

    -- job_sheet_responses.responses (JSONB) substring scan
    FOR _r IN
      SELECT jsr.id, j.org_id AS org
      FROM public.job_sheet_responses jsr
      LEFT JOIN public.jobs j ON j.id = jsr.job_id
      WHERE position(_bare in coalesce(jsr.responses::text,'')) > 0
         OR position(_url_public in coalesce(jsr.responses::text,'')) > 0
         OR position(_url_sign_prefix in coalesce(jsr.responses::text,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      -- Substring rewrite over the whole JSONB text via a text-cast round-trip.
      _rewrites := _rewrites || jsonb_build_object('table','job_sheet_responses','row_id',_r.id,'column','responses',
        'old_value', _old, 'new_value', _new, 'jsonb_substring', true);
    END LOOP;

    -- field_reports.content substring
    FOR _r IN
      SELECT fr.id, j.org_id AS org
      FROM public.field_reports fr
      LEFT JOIN public.jobs j ON j.id = fr.job_id
      WHERE position(_bare in coalesce(fr.content,'')) > 0
         OR position(_url_public in coalesce(fr.content,'')) > 0
         OR position(_url_sign_prefix in coalesce(fr.content,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','field_reports','row_id',_r.id,'column','content',
        'old_value', _old, 'new_value', _new);
    END LOOP;

    -- job_messages.message_body substring
    FOR _r IN
      SELECT jm.id, j.org_id AS org
      FROM public.job_messages jm
      LEFT JOIN public.jobs j ON j.id = jm.job_id
      WHERE position(_bare in coalesce(jm.message_body,'')) > 0
         OR position(_url_public in coalesce(jm.message_body,'')) > 0
         OR position(_url_sign_prefix in coalesce(jm.message_body,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','job_messages','row_id',_r.id,'column','message_body',
        'old_value', _old, 'new_value', _new);
    END LOOP;

    IF _org IS NULL THEN
      _org := _viva;
      _orphans := _orphans + 1;
    END IF;

    -- Recompute new_name using resolved org
    _new := _org::text || '/' || _old;
    -- Rebuild db_rewrites new_values with the resolved org prefix
    _rewrites := (
      SELECT COALESCE(jsonb_agg(
        CASE
          WHEN r->>'column' IN ('content','message_body') THEN
            r || jsonb_build_object('new_value', replace(r->>'old_value', _old, _new))
          WHEN (r->>'jsonb_substring')::boolean IS TRUE THEN
            r || jsonb_build_object('new_value', _new)
          ELSE
            r || jsonb_build_object('new_value',
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
    VALUES (_bucket, _old, _new, 'move', _org, (_org = _viva AND jsonb_array_length(_rewrites) = 0), _rewrites, 'pending')
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

-- Extend apply_backfill_rewrites to handle jsonb substring rewrites for
-- job_sheet_responses.responses / paper_scan_batch_items.raw_ocr (marker: jsonb_substring=true)
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

    -- JSONB substring rewrite (whole-column text replace, cast back to jsonb)
    IF (_r->>'jsonb_substring')::boolean IS TRUE THEN
      _sql := format(
        'UPDATE public.%I SET %I = replace(%I::text, $1, $2)::jsonb '
        'WHERE id = $3::uuid AND position($1 in %I::text) > 0',
        _table, _column, _column, _column
      );
      EXECUTE _sql USING _old, _new, _target_id;
    ELSIF _r ? 'json_path' AND jsonb_typeof(_r->'json_path') = 'array' THEN
      SELECT array_agg(value::text) INTO _json_path
      FROM jsonb_array_elements_text(_r->'json_path');
      _sql := format(
        'UPDATE public.%I SET %I = jsonb_set(%I, $1, to_jsonb($2::text), false) '
        'WHERE id = $3::uuid AND %I #>> $1 = $4',
        _table, _column, _column, _column
      );
      EXECUTE _sql USING _json_path, _new, _target_id, _old;
    ELSIF _column IN ('content','message_body') THEN
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

    GET DIAGNOSTICS _row_updated = ROW_COUNT;
    _updated := _updated + _row_updated;
  END LOOP;

  RETURN _updated;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_backfill_rewrites(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_backfill_rewrites(UUID) TO service_role;
