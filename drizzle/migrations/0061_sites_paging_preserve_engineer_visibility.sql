DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.sites_browser_page(text,text,integer,uuid,uuid,text)'::regprocedure);
 d:=replace(d,'p.deleted_at IS NULL AND p.id=ANY(ids)','p.deleted_at IS NULL AND (admin OR engineer_can_access_site(auth.uid(),p.id)) AND p.id=ANY(ids)');
 d:=replace(d,'p.deleted_at IS NULL), rows AS','p.deleted_at IS NULL AND (admin OR engineer_can_access_site(auth.uid(),p.id))), rows AS');
 d:=replace(d,'c.deleted_at IS NULL AND c.parent_id=s.id','c.deleted_at IS NULL AND (admin OR engineer_can_access_site(auth.uid(),c.id)) AND c.parent_id=s.id');
 d:=replace(d,'s.deleted_at IS NULL WHERE cs.org_id=o AND cs.customer_id=c.id','s.deleted_at IS NULL AND (admin OR engineer_can_access_site(auth.uid(),s.id)) WHERE cs.org_id=o AND cs.customer_id=c.id');
 EXECUTE d;
END $$;