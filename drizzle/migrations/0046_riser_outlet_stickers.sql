CREATE TABLE public.riser_outlet_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  outlet_number int NOT NULL CHECK (outlet_number > 0),
  outlet_tag text NOT NULL,
  label_printed_at timestamptz,
  last_scanned_at timestamptz,
  last_scanned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, outlet_number),
  UNIQUE (org_id, outlet_tag)
);
GRANT SELECT ON public.riser_outlet_tags TO authenticated;
GRANT ALL ON public.riser_outlet_tags TO service_role;
ALTER TABLE public.riser_outlet_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read own org outlet tags" ON public.riser_outlet_tags FOR SELECT TO authenticated
USING (org_id = public.get_user_org_id() AND NOT public.is_customer_user(auth.uid()));

CREATE TABLE public.riser_outlet_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  outlet_tag_id uuid NOT NULL REFERENCES public.riser_outlet_tags(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  scanned_by uuid NOT NULL,
  scanned_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.riser_outlet_scans TO authenticated;
GRANT ALL ON public.riser_outlet_scans TO service_role;
ALTER TABLE public.riser_outlet_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read own org outlet scans" ON public.riser_outlet_scans FOR SELECT TO authenticated
USING (org_id = public.get_user_org_id() AND NOT public.is_customer_user(auth.uid()));

-- Asset tags must also avoid outlet tags so every sticker number is unique in the company.
CREATE OR REPLACE FUNCTION public.generate_asset_tag(_org_id uuid)
 RETURNS text LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE chars constant text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; t text; i int; attempt int:=0;
BEGIN
 IF _org_id IS NULL THEN RAISE EXCEPTION 'Organisation required'; END IF;
 LOOP
  t:=''; FOR i IN 1..6 LOOP t:=t||substr(chars,1+floor(random()*length(chars))::int,1); END LOOP;
  EXIT WHEN NOT EXISTS(SELECT 1 FROM public.assets WHERE org_id=_org_id AND asset_tag=t)
       AND NOT EXISTS(SELECT 1 FROM public.riser_outlet_tags WHERE org_id=_org_id AND outlet_tag=t);
  attempt:=attempt+1; IF attempt>50 THEN RAISE EXCEPTION 'Could not generate unique asset tag'; END IF;
 END LOOP; RETURN t;
END $function$;

-- Office only: create missing outlet tags (1..outlets_count) for own-company risers; never duplicates.
CREATE OR REPLACE FUNCTION public.ensure_riser_outlet_tags(_asset_ids uuid[])
RETURNS TABLE(id uuid, asset_id uuid, outlet_number int, outlet_tag text, label_printed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _org uuid := public.get_user_org_id(); a record; n int;
BEGIN
  IF _org IS NULL OR NOT public.has_role_in_org(auth.uid(), _org, 'admin') THEN RAISE EXCEPTION 'Office only'; END IF;
  FOR a IN SELECT x.id, x.outlets_count FROM public.assets x
           WHERE x.id = ANY(_asset_ids) AND x.org_id = _org AND COALESCE(x.outlets_count,0) > 0
           ORDER BY x.id FOR UPDATE LOOP
    FOR n IN 1..LEAST(a.outlets_count, 200) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.riser_outlet_tags t WHERE t.asset_id = a.id AND t.outlet_number = n) THEN
        INSERT INTO public.riser_outlet_tags(org_id, asset_id, outlet_number, outlet_tag)
        VALUES (_org, a.id, n, public.generate_asset_tag(_org));
      END IF;
    END LOOP;
  END LOOP;
  RETURN QUERY SELECT t.id, t.asset_id, t.outlet_number, t.outlet_tag, t.label_printed_at
    FROM public.riser_outlet_tags t JOIN public.assets x ON x.id = t.asset_id
    WHERE t.asset_id = ANY(_asset_ids) AND t.org_id = _org AND t.outlet_number <= COALESCE(x.outlets_count,0)
    ORDER BY t.asset_id, t.outlet_number;
END $function$;
REVOKE ALL ON FUNCTION public.ensure_riser_outlet_tags(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_riser_outlet_tags(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_outlet_labels_printed(_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role_in_org(auth.uid(), public.get_user_org_id(), 'admin') THEN RAISE EXCEPTION 'Office only'; END IF;
  UPDATE public.riser_outlet_tags SET label_printed_at = now()
   WHERE id = ANY(_ids) AND org_id = public.get_user_org_id();
END $function$;
REVOKE ALL ON FUNCTION public.mark_outlet_labels_printed(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_outlet_labels_printed(uuid[]) TO authenticated;

-- Staff scan of an outlet sticker: logs attendance and returns the parent riser tag.
CREATE OR REPLACE FUNCTION public.record_outlet_scan(_tag text)
RETURNS TABLE(asset_tag text, outlet_number int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _org uuid := public.get_user_org_id(); r record;
BEGIN
  IF _org IS NULL OR public.is_customer_user(auth.uid())
     OR NOT (public.has_role_in_org(auth.uid(), _org, 'admin') OR public.has_role_in_org(auth.uid(), _org, 'engineer')) THEN RETURN; END IF;
  SELECT t.id, t.asset_id, t.outlet_number, a.asset_tag INTO r
    FROM public.riser_outlet_tags t JOIN public.assets a ON a.id = t.asset_id AND a.org_id = t.org_id
   WHERE t.org_id = _org AND upper(t.outlet_tag) = upper(_tag) LIMIT 1;
  IF r.id IS NULL THEN RETURN; END IF;
  INSERT INTO public.riser_outlet_scans(org_id, outlet_tag_id, asset_id, scanned_by) VALUES (_org, r.id, r.asset_id, auth.uid());
  UPDATE public.riser_outlet_tags SET last_scanned_at = now(), last_scanned_by = auth.uid() WHERE id = r.id;
  asset_tag := r.asset_tag; outlet_number := r.outlet_number; RETURN NEXT;
END $function$;
REVOKE ALL ON FUNCTION public.record_outlet_scan(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_outlet_scan(text) TO authenticated;