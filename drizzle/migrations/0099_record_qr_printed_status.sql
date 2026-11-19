DO $migration$
DECLARE definition text;
BEGIN
SELECT pg_get_functiondef('public.log_riser_label_reprints(jsonb)'::regprocedure) INTO definition;
definition := replace(definition, 'RETURN _count;', 'UPDATE public.assets a SET label_printed_at=now(), label_status=CASE WHEN a.label_status=''placed'' THEN ''placed'' ELSE ''printed'' END WHERE a.org_id=_org AND EXISTS(SELECT 1 FROM jsonb_array_elements(_labels) l WHERE (l->>''asset_id'')::uuid=a.id AND (l->>''outlet_number'')::integer=0); UPDATE public.riser_outlet_tags t SET label_printed_at=now() WHERE t.org_id=_org AND EXISTS(SELECT 1 FROM jsonb_array_elements(_labels) l WHERE (l->>''asset_id'')::uuid=t.asset_id AND (l->>''outlet_number'')::integer=t.outlet_number AND l->>''tag''=t.outlet_tag); RETURN _count;');
EXECUTE definition;
END $migration$;