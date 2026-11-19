DO $migration$
DECLARE definition text;
BEGIN
SELECT pg_get_functiondef('public.get_riser_report_context(uuid,uuid)'::regprocedure) INTO definition;
definition := replace(definition, 'IF a.outlets_count IS NULL OR a.inlets_count IS NULL THEN RAISE EXCEPTION ''The riser inlet or outlet count has not been recorded''; END IF;', '');
EXECUTE definition;
SELECT pg_get_functiondef('public.sync_riser_outlet_codes(uuid)'::regprocedure) INTO definition;
definition := replace(definition, 'target:=GREATEST(COALESCE(a.outlets_count,0),0);', 'IF a.outlets_count IS NULL THEN RETURN; END IF; target:=GREATEST(a.outlets_count,0);');
EXECUTE definition;
END $migration$;