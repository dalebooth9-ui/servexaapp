CREATE TABLE public.riser_label_reprints (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES public.organisations(id),
 asset_id uuid NOT NULL REFERENCES public.assets(id),
 printed_by uuid NOT NULL,
 printed_by_name text NOT NULL,
 labels jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.riser_label_reprints TO authenticated;
GRANT ALL ON public.riser_label_reprints TO service_role;
ALTER TABLE public.riser_label_reprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company office reads reprints" ON public.riser_label_reprints FOR SELECT TO authenticated USING (org_id=public.get_user_org_id() AND public.has_role_in_org(auth.uid(),org_id,'admin'::public.app_role));
CREATE INDEX riser_label_reprints_asset_date ON public.riser_label_reprints(asset_id,created_at DESC);
CREATE OR REPLACE FUNCTION public.log_riser_label_reprints(_labels jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid:=public.get_user_org_id(); _name text; _row jsonb; _asset uuid; _tag text; _n integer; _count integer;
BEGIN
 IF _org IS NULL OR NOT public.has_role_in_org(auth.uid(),_org,'admin'::public.app_role) THEN RAISE EXCEPTION 'Company admin required'; END IF;
 IF jsonb_typeof(_labels) IS DISTINCT FROM 'array' OR jsonb_array_length(_labels)=0 OR jsonb_array_length(_labels)>10000 THEN RAISE EXCEPTION 'Select existing labels'; END IF;
 SELECT full_name INTO _name FROM public.profiles WHERE user_id=auth.uid() AND org_id=_org;
 FOR _row IN SELECT value FROM jsonb_array_elements(_labels) LOOP
  _asset:=(_row->>'asset_id')::uuid; _tag:=_row->>'tag'; _n:=(_row->>'outlet_number')::integer;
  IF NOT EXISTS(SELECT 1 FROM public.assets WHERE id=_asset AND org_id=_org AND merged_into_asset_id IS NULL) THEN RAISE EXCEPTION 'Riser unavailable'; END IF;
  IF _n=0 THEN
   IF NOT EXISTS(SELECT 1 FROM public.assets WHERE id=_asset AND org_id=_org AND asset_tag=_tag) THEN RAISE EXCEPTION 'Inlet tag does not match'; END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM public.riser_outlet_tags WHERE asset_id=_asset AND org_id=_org AND outlet_number=_n AND outlet_tag=_tag) THEN RAISE EXCEPTION 'Outlet tag does not match'; END IF;
  END IF;
 END LOOP;
 INSERT INTO public.riser_label_reprints(org_id,asset_id,printed_by,printed_by_name,labels)
 SELECT _org,(value->>'asset_id')::uuid,auth.uid(),coalesce(_name,'Office'),jsonb_agg(jsonb_build_object('tag',value->>'tag','outlet_number',(value->>'outlet_number')::integer))
 FROM jsonb_array_elements(_labels) GROUP BY (value->>'asset_id')::uuid;
 GET DIAGNOSTICS _count=ROW_COUNT;
 RETURN _count;
END $$;
REVOKE ALL ON FUNCTION public.log_riser_label_reprints(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.log_riser_label_reprints(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_riser_label_reprints(jsonb) TO service_role;