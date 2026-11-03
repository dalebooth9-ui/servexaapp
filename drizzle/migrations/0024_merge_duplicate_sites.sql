ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_into_site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;

-- Merged (soft-deleted) sites disappear from every normal read; undo uses security-definer RPCs.
CREATE POLICY "Hide merged sites" ON public.sites AS RESTRICTIVE FOR SELECT TO public USING (deleted_at IS NULL);

CREATE TABLE public.site_merge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  kept_site_id uuid NOT NULL,
  merged_site_id uuid NOT NULL,
  merged_by uuid,
  kept_before jsonb NOT NULL,
  moved jsonb NOT NULL DEFAULT '{}'::jsonb,
  removed_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  undone_by uuid
);
GRANT SELECT ON public.site_merge_log TO authenticated;
GRANT ALL ON public.site_merge_log TO service_role;
ALTER TABLE public.site_merge_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admins read site merge log" ON public.site_merge_log FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id() AND public.has_role_in_org(auth.uid(), org_id, 'admin'::app_role));
CREATE INDEX site_merge_log_org_created ON public.site_merge_log (org_id, created_at DESC);

-- Per-site data counts (no money values). Staff of the caller's org only.
CREATE OR REPLACE FUNCTION public.site_data_stats()
RETURNS TABLE(site_id uuid, buildings bigint, assets bigint, jobs bigint, defects bigint, reports bigint,
  agreements bigint, documents bigint, last_activity timestamptz, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT public.get_user_org_id() AS org
              WHERE NOT public.is_customer_user(auth.uid())),
  s AS (SELECT si.id, si.updated_at FROM public.sites si, me WHERE si.org_id = me.org AND si.deleted_at IS NULL),
  b AS (SELECT parent_id k, count(*) n FROM public.sites WHERE parent_id IN (SELECT id FROM s) AND deleted_at IS NULL GROUP BY 1),
  a AS (SELECT site_id k, count(*) n FROM public.assets WHERE site_id IN (SELECT id FROM s) GROUP BY 1),
  j AS (SELECT site_id k, count(*) n, max(created_at) m FROM public.jobs WHERE site_id IN (SELECT id FROM s) GROUP BY 1),
  d AS (SELECT site_id k, count(*) n, max(created_at) m FROM public.defects WHERE site_id IN (SELECT id FROM s) GROUP BY 1),
  r AS (SELECT k, sum(n) n FROM (
          SELECT site_id k, count(*) n FROM public.historic_reports WHERE site_id IN (SELECT id FROM s) GROUP BY 1
          UNION ALL SELECT site_id, count(*) FROM public.asset_service_history WHERE site_id IN (SELECT id FROM s) GROUP BY 1
          UNION ALL SELECT site_id, count(*) FROM public.site_surveys WHERE site_id IN (SELECT id FROM s) GROUP BY 1
          UNION ALL SELECT site_id, count(*) FROM public.compliance_records WHERE site_id IN (SELECT id FROM s) GROUP BY 1
          UNION ALL SELECT site_id, count(*) FROM public.audits WHERE site_id IN (SELECT id FROM s) GROUP BY 1
        ) x GROUP BY 1),
  g AS (SELECT k, sum(n) n FROM (
          SELECT site_id k, count(*) n FROM public.service_contract_sites WHERE site_id IN (SELECT id FROM s) GROUP BY 1
          UNION ALL SELECT site_id, count(*) FROM public.site_service_schedules WHERE site_id IN (SELECT id FROM s) GROUP BY 1
        ) x GROUP BY 1),
  o AS (SELECT site_id k, count(*) n FROM public.archived_documents WHERE site_id IN (SELECT id FROM s) GROUP BY 1)
  SELECT s.id,
    coalesce(b.n,0), coalesce(a.n,0), coalesce(j.n,0), coalesce(d.n,0), coalesce(r.n,0)::bigint,
    coalesce(g.n,0)::bigint, coalesce(o.n,0),
    greatest(s.updated_at, j.m, d.m),
    coalesce(b.n,0)+coalesce(a.n,0)+coalesce(j.n,0)+coalesce(d.n,0)+coalesce(r.n,0)::bigint+coalesce(g.n,0)::bigint+coalesce(o.n,0)
  FROM s LEFT JOIN b ON b.k=s.id LEFT JOIN a ON a.k=s.id LEFT JOIN j ON j.k=s.id LEFT JOIN d ON d.k=s.id
    LEFT JOIN r ON r.k=s.id LEFT JOIN g ON g.k=s.id LEFT JOIN o ON o.k=s.id;
$$;
REVOKE ALL ON FUNCTION public.site_data_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_data_stats() TO authenticated;

-- Merge: _groups = [{"keep": uuid, "dups": [uuid,...]}, ...]. One transaction, one batch.
CREATE OR REPLACE FUNCTION public.merge_sites(_groups jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := public.get_user_org_id();
  v_batch uuid := gen_random_uuid();
  grp jsonb; v_keep uuid; v_dup uuid;
  k public.sites; dp public.sites;
  t text; ids jsonb; moved jsonb; removed jsonb;
  simple_tables text[] := ARRAY['archived_documents','asset_review_flags','assets','audits','compliance_records',
    'defects','fire_log_entries','fire_log_tokens','historic_reports','jobs','portal_visit_requests',
    'renewal_reminder_log','site_surveys'];
BEGIN
  IF v_org IS NULL OR NOT public.has_role_in_org(auth.uid(), v_org, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  FOR grp IN SELECT * FROM jsonb_array_elements(_groups) LOOP
    v_keep := (grp->>'keep')::uuid;
    FOR v_dup IN SELECT (x)::uuid FROM jsonb_array_elements_text(grp->'dups') x LOOP
      IF v_dup = v_keep THEN CONTINUE; END IF;
      SELECT * INTO k FROM public.sites WHERE id = v_keep AND org_id = v_org AND deleted_at IS NULL FOR UPDATE;
      SELECT * INTO dp FROM public.sites WHERE id = v_dup AND org_id = v_org AND deleted_at IS NULL FOR UPDATE;
      IF k.id IS NULL OR dp.id IS NULL THEN RAISE EXCEPTION 'Site not found or already merged'; END IF;
      moved := '{}'::jsonb; removed := '[]'::jsonb;

      FOREACH t IN ARRAY simple_tables LOOP
        EXECUTE format('WITH u AS (UPDATE public.%I SET site_id = $1 WHERE site_id = $2 RETURNING id) SELECT coalesce(jsonb_agg(id), ''[]''::jsonb) FROM u', t)
          INTO ids USING v_keep, v_dup;
        IF jsonb_array_length(ids) > 0 THEN moved := moved || jsonb_build_object(t, ids); END IF;
      END LOOP;

      -- paper scan guesses
      WITH u AS (UPDATE public.paper_scan_batch_items SET guess_site_id = v_keep WHERE guess_site_id = v_dup RETURNING id)
        SELECT coalesce(jsonb_agg(id),'[]') INTO ids FROM u;
      IF jsonb_array_length(ids) > 0 THEN moved := moved || jsonb_build_object('paper_scan_batch_items', ids); END IF;

      -- riser history (unique site+report_file): skip rows the kept site already has
      WITH u AS (UPDATE public.asset_service_history h SET site_id = v_keep WHERE h.site_id = v_dup
          AND (h.report_file IS NULL OR NOT EXISTS (SELECT 1 FROM public.asset_service_history x WHERE x.site_id = v_keep AND x.report_file = h.report_file))
          RETURNING h.id) SELECT coalesce(jsonb_agg(id),'[]') INTO ids FROM u;
      IF jsonb_array_length(ids) > 0 THEN moved := moved || jsonb_build_object('asset_service_history', ids); END IF;

      -- customer links / contract links / schedules: move unless kept site already has the same
      WITH u AS (UPDATE public.customer_sites c SET site_id = v_keep WHERE c.site_id = v_dup
          AND NOT EXISTS (SELECT 1 FROM public.customer_sites x WHERE x.site_id = v_keep AND x.customer_id = c.customer_id)
          RETURNING c.id) SELECT coalesce(jsonb_agg(id),'[]') INTO ids FROM u;
      IF jsonb_array_length(ids) > 0 THEN moved := moved || jsonb_build_object('customer_sites', ids); END IF;
      WITH dl AS (DELETE FROM public.customer_sites c WHERE c.site_id = v_dup RETURNING to_jsonb(c) r)
        SELECT coalesce(jsonb_agg(r),'[]') INTO removed FROM dl;

      WITH u AS (UPDATE public.service_contract_sites c SET site_id = v_keep WHERE c.site_id = v_dup
          AND NOT EXISTS (SELECT 1 FROM public.service_contract_sites x WHERE x.site_id = v_keep AND x.contract_id = c.contract_id)
          RETURNING c.id) SELECT coalesce(jsonb_agg(id),'[]') INTO ids FROM u;
      IF jsonb_array_length(ids) > 0 THEN moved := moved || jsonb_build_object('service_contract_sites', ids); END IF;

      WITH u AS (UPDATE public.site_service_schedules c SET site_id = v_keep WHERE c.site_id = v_dup
          AND NOT EXISTS (SELECT 1 FROM public.site_service_schedules x WHERE x.site_id = v_keep AND x.org_id = c.org_id AND x.template_id = c.template_id)
          RETURNING c.id) SELECT coalesce(jsonb_agg(id),'[]') INTO ids FROM u;
      IF jsonb_array_length(ids) > 0 THEN moved := moved || jsonb_build_object('site_service_schedules', ids); END IF;

      -- buildings / child sites
      IF k.parent_id = v_dup THEN
        UPDATE public.sites SET parent_id = dp.parent_id WHERE id = v_keep;
      END IF;
      WITH u AS (UPDATE public.sites SET parent_id = v_keep WHERE parent_id = v_dup AND id <> v_keep RETURNING id)
        SELECT coalesce(jsonb_agg(id),'[]') INTO ids FROM u;
      IF jsonb_array_length(ids) > 0 THEN moved := moved || jsonb_build_object('sites_parent', ids); END IF;

      -- fill blanks on the kept site
      UPDATE public.sites SET
        address = coalesce(nullif(trim(address),''), dp.address),
        postcode = coalesce(nullif(trim(postcode),''), dp.postcode),
        contact_name = coalesce(nullif(trim(contact_name),''), dp.contact_name),
        contact_email = coalesce(nullif(trim(contact_email),''), dp.contact_email),
        contact_phone = coalesce(nullif(trim(contact_phone),''), dp.contact_phone),
        notes = coalesce(nullif(trim(notes),''), dp.notes),
        what3words = coalesce(nullif(trim(what3words),''), dp.what3words),
        riser_location = coalesce(nullif(trim(riser_location),''), dp.riser_location),
        outlets_count = coalesce(outlets_count, dp.outlets_count),
        category = coalesce(nullif(trim(category),''), dp.category)
      WHERE id = v_keep;

      UPDATE public.sites SET deleted_at = now(), merged_into_site_id = v_keep WHERE id = v_dup;

      INSERT INTO public.site_merge_log (org_id, batch_id, kept_site_id, merged_site_id, merged_by, kept_before, moved, removed_links)
      VALUES (v_org, v_batch, v_keep, v_dup, auth.uid(), to_jsonb(k), moved, removed);
    END LOOP;
  END LOOP;
  RETURN v_batch;
END $$;
REVOKE ALL ON FUNCTION public.merge_sites(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_sites(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.undo_last_site_merge()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := public.get_user_org_id();
  v_batch uuid; l public.site_merge_log; t text; n int := 0; kb jsonb;
BEGIN
  IF v_org IS NULL OR NOT public.has_role_in_org(auth.uid(), v_org, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT batch_id INTO v_batch FROM public.site_merge_log WHERE org_id = v_org AND undone_at IS NULL ORDER BY created_at DESC LIMIT 1;
  IF v_batch IS NULL THEN RETURN 0; END IF;
  FOR l IN SELECT * FROM public.site_merge_log WHERE batch_id = v_batch AND org_id = v_org ORDER BY created_at DESC, id DESC LOOP
    UPDATE public.sites SET deleted_at = NULL, merged_into_site_id = NULL WHERE id = l.merged_site_id;
    FOR t IN SELECT jsonb_object_keys(l.moved) LOOP
      IF t = 'sites_parent' THEN
        UPDATE public.sites SET parent_id = l.merged_site_id WHERE id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(l.moved->t) x);
      ELSIF t = 'paper_scan_batch_items' THEN
        UPDATE public.paper_scan_batch_items SET guess_site_id = l.merged_site_id WHERE id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(l.moved->t) x);
      ELSE
        EXECUTE format('UPDATE public.%I SET site_id = $1 WHERE id IN (SELECT (x)::uuid FROM jsonb_array_elements_text($2) x)', t)
          USING l.merged_site_id, l.moved->t;
      END IF;
    END LOOP;
    INSERT INTO public.customer_sites SELECT * FROM jsonb_populate_recordset(NULL::public.customer_sites, l.removed_links)
      ON CONFLICT DO NOTHING;
    kb := l.kept_before;
    UPDATE public.sites SET
      parent_id = (kb->>'parent_id')::uuid, address = kb->>'address', postcode = kb->>'postcode',
      contact_name = kb->>'contact_name', contact_email = kb->>'contact_email', contact_phone = kb->>'contact_phone',
      notes = kb->>'notes', what3words = kb->>'what3words', riser_location = kb->>'riser_location',
      outlets_count = (kb->>'outlets_count')::int, category = kb->>'category'
    WHERE id = l.kept_site_id;
    UPDATE public.site_merge_log SET undone_at = now(), undone_by = auth.uid() WHERE id = l.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.undo_last_site_merge() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_last_site_merge() TO authenticated;