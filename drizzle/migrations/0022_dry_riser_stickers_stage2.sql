ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS label_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS label_printed_at timestamptz,
  ADD COLUMN IF NOT EXISTS label_placed_at timestamptz,
  ADD COLUMN IF NOT EXISTS label_placed_by uuid;

CREATE OR REPLACE FUNCTION public.validate_asset_label_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.label_status NOT IN ('none','printed','placed') THEN
    RAISE EXCEPTION 'Invalid label_status: %', NEW.label_status;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_asset_label_status ON public.assets;
CREATE TRIGGER trg_validate_asset_label_status BEFORE INSERT OR UPDATE OF label_status ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.validate_asset_label_status();

CREATE OR REPLACE FUNCTION public.lookup_asset_by_tag(_tag text)
RETURNS TABLE(id uuid, asset_tag text, riser_location text, outlets_count int, status text,
  last_inspection_at timestamptz, last_inspection_type text, last_inspection_result text,
  label_status text, site_id uuid, site_name text, site_address text, customer_id uuid, customer_name text, open_defects bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.asset_tag, a.riser_location, a.outlets_count, a.status,
    a.last_inspection_at, a.last_inspection_type, a.last_inspection_result,
    a.label_status, a.site_id, s.name, s.address, c.id, c.name,
    (SELECT count(*) FROM public.defects d WHERE d.asset_id = a.id AND d.status <> 'resolved')
  FROM public.assets a
  LEFT JOIN public.sites s ON s.id = a.site_id
  LEFT JOIN LATERAL (
    SELECT cid FROM (
      SELECT j.customer_id AS cid, 1 AS pri, j.created_at AS ts FROM public.jobs j WHERE j.site_id = a.site_id AND j.customer_id IS NOT NULL
      UNION ALL
      SELECT cs.customer_id, 2, cs.created_at FROM public.customer_sites cs WHERE cs.site_id = a.site_id
    ) x ORDER BY pri, ts DESC LIMIT 1
  ) cx ON true
  LEFT JOIN public.customers c ON c.id = cx.cid
  WHERE upper(a.asset_tag) = upper(_tag)
    AND a.org_id = public.get_user_org_id()
    AND NOT public.is_customer_user(auth.uid())
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.mark_asset_label_placed(_asset_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_customer_user(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE public.assets SET label_status='placed', label_placed_at=now(), label_placed_by=auth.uid(), updated_at=now()
   WHERE id=_asset_id AND org_id = public.get_user_org_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset not found'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.report_wrong_riser(_asset_id uuid, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record;
BEGIN
  IF auth.uid() IS NULL OR public.is_customer_user(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT x.id, x.site_id, x.org_id, x.label_status INTO a FROM public.assets x WHERE x.id=_asset_id AND x.org_id = public.get_user_org_id();
  IF a.id IS NULL THEN RAISE EXCEPTION 'Asset not found'; END IF;
  INSERT INTO public.asset_review_flags(asset_id, site_id, org_id, field, old_value, new_value, reason, status)
  VALUES (a.id, a.site_id, a.org_id, 'label', a.label_status, NULL, left(coalesce(nullif(trim(_note),''),'Wrong riser reported from sticker scan'), 2000), 'open');
END $$;

CREATE OR REPLACE FUNCTION public.mark_assets_label_printed(_asset_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin') THEN RAISE EXCEPTION 'Office only'; END IF;
  UPDATE public.assets SET label_status='printed', label_printed_at=now(), updated_at=now()
   WHERE id = ANY(_asset_ids) AND org_id = public.get_user_org_id() AND label_status <> 'placed';
END $$;

CREATE OR REPLACE FUNCTION public.add_site_risers(_site_id uuid, _locations text[])
RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid := public.get_user_org_id(); loc text; new_id uuid;
BEGIN
  IF NOT public.has_role_in_org(auth.uid(), _org, 'admin') THEN RAISE EXCEPTION 'Office only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id=_site_id AND org_id=_org) THEN RAISE EXCEPTION 'Site not found'; END IF;
  FOREACH loc IN ARRAY _locations LOOP
    IF coalesce(trim(loc),'') = '' THEN CONTINUE; END IF;
    INSERT INTO public.assets(name, category, asset_type, riser_location, site_id, org_id, status, created_by)
    VALUES ('Dry Riser - '||trim(loc), 'Dry Riser', 'Dry Riser', trim(loc), _site_id, _org, 'operational', auth.uid())
    RETURNING id INTO new_id;
    RETURN NEXT new_id;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.lookup_asset_by_tag(text), public.mark_asset_label_placed(uuid), public.report_wrong_riser(uuid,text), public.mark_assets_label_printed(uuid[]), public.add_site_risers(uuid,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_asset_by_tag(text), public.mark_asset_label_placed(uuid), public.report_wrong_riser(uuid,text), public.mark_assets_label_printed(uuid[]), public.add_site_risers(uuid,text[]) TO authenticated;