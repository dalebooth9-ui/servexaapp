
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

    -- Only skip if first segment is an ACTUAL organisation id.
    _first_seg := split_part(_old, '/', 1);
    _is_org_prefixed := false;
    IF _first_seg ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      IF EXISTS (SELECT 1 FROM public.organisations WHERE id = _first_seg::uuid) THEN
        _is_org_prefixed := true;
      END IF;
    END IF;

    IF _is_org_prefixed THEN
      INSERT INTO public.storage_backfill_log (bucket, old_name, new_name, op, org_id, is_orphan, db_rewrites, status)
      VALUES (_bucket, _old, _old, 'move', _first_seg::uuid, false, '[]'::jsonb, 'skipped')
      ON CONFLICT (bucket, old_name) DO UPDATE
        SET status = CASE WHEN storage_backfill_log.status IN ('done','failed','in_progress') THEN storage_backfill_log.status ELSE 'skipped' END,
            org_id = EXCLUDED.org_id,
            updated_at = now();
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    IF _bucket = 'blank-template-pdfs' THEN
      INSERT INTO public.storage_backfill_log (bucket, old_name, new_name, op, org_id, is_orphan, db_rewrites, status)
      VALUES (_bucket, _old, NULL, 'delete', _viva, true, '[]'::jsonb, 'pending')
      ON CONFLICT (bucket, old_name) DO UPDATE
        SET status = CASE WHEN storage_backfill_log.status IN ('done','failed','in_progress') THEN storage_backfill_log.status ELSE 'pending' END,
            updated_at = now();
      _inserted := _inserted + 1;
      CONTINUE;
    END IF;

    _bare := _old;
    _durable := 'storage://' || _bucket || '/' || _old;
    _url_public := '/object/public/' || _bucket || '/' || _old;
    _url_sign_prefix := '/object/sign/' || _bucket || '/' || _old;
    _rewrites := '[]'::jsonb;
    _org := NULL;

    -- submissions.file_url (use submissions.org_id directly if present, else via jobs)
    FOR _r IN
      SELECT s.id, s.file_url, COALESCE(s.org_id, j.org_id) AS org
      FROM public.submissions s
      LEFT JOIN public.jobs j ON j.id = s.job_id
      WHERE s.file_url = _bare OR s.file_url = _durable
         OR position(_url_public in coalesce(s.file_url,'')) > 0
         OR position(_url_sign_prefix in coalesce(s.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','submissions','row_id',_r.id,'column','file_url','old_value',_r.file_url,'new_value','__PLACEHOLDER__');
    END LOOP;

    -- job_documents.file_url via jobs
    FOR _r IN
      SELECT jd.id, jd.file_url, j.org_id AS org
      FROM public.job_documents jd
      LEFT JOIN public.jobs j ON j.id = jd.job_id
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

    -- job_signatures.file_path via jobs
    FOR _r IN
      SELECT js.id, js.file_path, j.org_id AS org
      FROM public.job_signatures js
      LEFT JOIN public.jobs j ON j.id = js.job_id
      WHERE js.file_path = _bare OR js.file_path = _durable
         OR position(_url_public in coalesce(js.file_path,'')) > 0
         OR position(_url_sign_prefix in coalesce(js.file_path,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','job_signatures','row_id',_r.id,'column','file_path','old_value',_r.file_path,'new_value','__PLACEHOLDER__');
    END LOOP;

    -- engineer_signatures.file_path (own org_id)
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

    -- rams_documents (pdf_url, word_url, file_url) — own org_id
    FOR _r IN
      SELECT rd.id, rd.pdf_url, rd.word_url, rd.file_url, rd.org_id AS org
      FROM public.rams_documents rd
      WHERE rd.pdf_url = _bare OR rd.pdf_url = _durable OR position(_url_public in coalesce(rd.pdf_url,'')) > 0 OR position(_url_sign_prefix in coalesce(rd.pdf_url,'')) > 0
         OR rd.word_url = _bare OR rd.word_url = _durable OR position(_url_public in coalesce(rd.word_url,'')) > 0 OR position(_url_sign_prefix in coalesce(rd.word_url,'')) > 0
         OR rd.file_url = _bare OR rd.file_url = _durable OR position(_url_public in coalesce(rd.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(rd.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      IF _r.pdf_url = _bare OR _r.pdf_url = _durable OR position(_url_public in coalesce(_r.pdf_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.pdf_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','rams_documents','row_id',_r.id,'column','pdf_url','old_value',_r.pdf_url,'new_value','__PLACEHOLDER__');
      END IF;
      IF _r.word_url = _bare OR _r.word_url = _durable OR position(_url_public in coalesce(_r.word_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.word_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','rams_documents','row_id',_r.id,'column','word_url','old_value',_r.word_url,'new_value','__PLACEHOLDER__');
      END IF;
      IF _r.file_url = _bare OR _r.file_url = _durable OR position(_url_public in coalesce(_r.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.file_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','rams_documents','row_id',_r.id,'column','file_url','old_value',_r.file_url,'new_value','__PLACEHOLDER__');
      END IF;
    END LOOP;

    -- conformity_certificates (pdf_url, file_url) — own org_id
    FOR _r IN
      SELECT cc.id, cc.pdf_url, cc.file_url, cc.org_id AS org
      FROM public.conformity_certificates cc
      WHERE cc.pdf_url = _bare OR cc.pdf_url = _durable OR position(_url_public in coalesce(cc.pdf_url,'')) > 0 OR position(_url_sign_prefix in coalesce(cc.pdf_url,'')) > 0
         OR cc.file_url = _bare OR cc.file_url = _durable OR position(_url_public in coalesce(cc.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(cc.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      IF _r.pdf_url = _bare OR _r.pdf_url = _durable OR position(_url_public in coalesce(_r.pdf_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.pdf_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','conformity_certificates','row_id',_r.id,'column','pdf_url','old_value',_r.pdf_url,'new_value','__PLACEHOLDER__');
      END IF;
      IF _r.file_url = _bare OR _r.file_url = _durable OR position(_url_public in coalesce(_r.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.file_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','conformity_certificates','row_id',_r.id,'column','file_url','old_value',_r.file_url,'new_value','__PLACEHOLDER__');
      END IF;
    END LOOP;

    -- site_survey_photos — own org_id
    FOR _r IN
      SELECT sp.id, sp.photo_url, sp.file_url, sp.org_id AS org
      FROM public.site_survey_photos sp
      WHERE sp.photo_url = _bare OR sp.photo_url = _durable OR position(_url_public in coalesce(sp.photo_url,'')) > 0 OR position(_url_sign_prefix in coalesce(sp.photo_url,'')) > 0
         OR sp.file_url = _bare OR sp.file_url = _durable OR position(_url_public in coalesce(sp.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(sp.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      IF _r.photo_url = _bare OR _r.photo_url = _durable OR position(_url_public in coalesce(_r.photo_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.photo_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','site_survey_photos','row_id',_r.id,'column','photo_url','old_value',_r.photo_url,'new_value','__PLACEHOLDER__');
      END IF;
      IF _r.file_url = _bare OR _r.file_url = _durable OR position(_url_public in coalesce(_r.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.file_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','site_survey_photos','row_id',_r.id,'column','file_url','old_value',_r.file_url,'new_value','__PLACEHOLDER__');
      END IF;
    END LOOP;

    -- job_site_survey_photos — own org_id
    FOR _r IN
      SELECT jsp.id, jsp.photo_url, jsp.file_url, jsp.org_id AS org
      FROM public.job_site_survey_photos jsp
      WHERE jsp.photo_url = _bare OR jsp.photo_url = _durable OR position(_url_public in coalesce(jsp.photo_url,'')) > 0 OR position(_url_sign_prefix in coalesce(jsp.photo_url,'')) > 0
         OR jsp.file_url = _bare OR jsp.file_url = _durable OR position(_url_public in coalesce(jsp.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(jsp.file_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      IF _r.photo_url = _bare OR _r.photo_url = _durable OR position(_url_public in coalesce(_r.photo_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.photo_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','job_site_survey_photos','row_id',_r.id,'column','photo_url','old_value',_r.photo_url,'new_value','__PLACEHOLDER__');
      END IF;
      IF _r.file_url = _bare OR _r.file_url = _durable OR position(_url_public in coalesce(_r.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.file_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','job_site_survey_photos','row_id',_r.id,'column','file_url','old_value',_r.file_url,'new_value','__PLACEHOLDER__');
      END IF;
    END LOOP;

    -- paper_scan_batch_items — own org_id
    FOR _r IN
      SELECT pi.id, pi.file_url, pi.pdf_url, pi.org_id AS org
      FROM public.paper_scan_batch_items pi
      WHERE pi.file_url = _bare OR pi.file_url = _durable OR position(_url_public in coalesce(pi.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(pi.file_url,'')) > 0
         OR pi.pdf_url  = _bare OR pi.pdf_url  = _durable OR position(_url_public in coalesce(pi.pdf_url,'')) > 0 OR position(_url_sign_prefix in coalesce(pi.pdf_url,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      IF _r.file_url = _bare OR _r.file_url = _durable OR position(_url_public in coalesce(_r.file_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.file_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','paper_scan_batch_items','row_id',_r.id,'column','file_url','old_value',_r.file_url,'new_value','__PLACEHOLDER__');
      END IF;
      IF _r.pdf_url = _bare OR _r.pdf_url = _durable OR position(_url_public in coalesce(_r.pdf_url,'')) > 0 OR position(_url_sign_prefix in coalesce(_r.pdf_url,'')) > 0 THEN
        _rewrites := _rewrites || jsonb_build_object('table','paper_scan_batch_items','row_id',_r.id,'column','pdf_url','old_value',_r.pdf_url,'new_value','__PLACEHOLDER__');
      END IF;
    END LOOP;

    -- job_sheet_responses.responses (jsonb substring)
    FOR _r IN
      SELECT jsr.id, j.org_id AS org
      FROM public.job_sheet_responses jsr
      LEFT JOIN public.jobs j ON j.id = jsr.job_id
      WHERE position(_bare in coalesce(jsr.responses::text,'')) > 0
         OR position(_url_public in coalesce(jsr.responses::text,'')) > 0
         OR position(_url_sign_prefix in coalesce(jsr.responses::text,'')) > 0
    LOOP
      _org := COALESCE(_org, _r.org);
      _rewrites := _rewrites || jsonb_build_object('table','job_sheet_responses','row_id',_r.id,'column','responses','old_value',_old,'new_value','__PLACEHOLDER__','jsonb_substring',true);
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
      _rewrites := _rewrites || jsonb_build_object('table','field_reports','row_id',_r.id,'column','content','old_value',_old,'new_value','__PLACEHOLDER__');
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
      _rewrites := _rewrites || jsonb_build_object('table','job_messages','row_id',_r.id,'column','message_body','old_value',_old,'new_value','__PLACEHOLDER__');
    END LOOP;

    IF _org IS NULL THEN
      _org := _viva;
      _orphans := _orphans + 1;
    END IF;

    _new := _org::text || '/' || _old;

    -- Fill in real new_value for each rewrite now that we know the target org.
    _rewrites := (
      SELECT COALESCE(jsonb_agg(
        CASE
          WHEN r->>'column' IN ('content','message_body') THEN
            r - 'new_value' || jsonb_build_object('new_value', replace(r->>'old_value', _old, _new))
          WHEN (r->>'jsonb_substring')::boolean IS TRUE THEN
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

-- Wipe prior skipped rows from the buggy first attempt so re-prepare reclassifies them.
DELETE FROM public.storage_backfill_log WHERE status = 'skipped';
