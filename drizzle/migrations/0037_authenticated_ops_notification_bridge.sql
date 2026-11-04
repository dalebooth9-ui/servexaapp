CREATE OR REPLACE FUNCTION public.notify_new_email_triage_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,net AS $fn$
DECLARE v_ops text; v_company text; v_request bigint; v_error text; v_token uuid:=gen_random_uuid();
BEGIN
 IF NEW.source IS DISTINCT FROM 'Email Triage' THEN RETURN NEW; END IF;
 BEGIN
  SELECT name INTO v_company FROM public.organisations WHERE id=NEW.org_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Job company is missing'; END IF;
  SELECT coalesce(nullif(trim(reply_to),''),nullif(trim(from_address),'')) INTO v_ops FROM public.email_branding WHERE org_id=NEW.org_id;
  IF v_ops IS NULL THEN RAISE EXCEPTION 'Company ops address is not configured in Email branding'; END IF;
  INSERT INTO public.ops_notification_requests(org_id,job_id,token) VALUES(NEW.org_id,NEW.id,v_token);
  v_request:=net.http_post(url:='https://geyrqplwjzwdiaeqaeul.supabase.co/functions/v1/ops-job-notification',headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('job_id',NEW.id,'notification_token',v_token));
  INSERT INTO public.email_step_health(org_id,step,status,job_id,request_id,error_message,checked_at) VALUES(NEW.org_id,'email_triage_ops','pending',NEW.id,v_request,NULL,now()) ON CONFLICT(org_id,step) DO UPDATE SET status='pending',job_id=excluded.job_id,request_id=excluded.request_id,error_message=NULL,checked_at=excluded.checked_at;
 EXCEPTION WHEN OTHERS THEN
  v_error:=SQLSTATE||': '||SQLERRM;
  RAISE WARNING 'Email Triage job % saved; ops notification failed: %',NEW.id,v_error;
  BEGIN
   INSERT INTO public.email_step_health(org_id,step,status,error_message,checked_at) VALUES(NEW.org_id,'email_triage_ops','failed',v_error,now()) ON CONFLICT(org_id,step) DO UPDATE SET status='failed',error_message=excluded.error_message,request_id=NULL,checked_at=excluded.checked_at;
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Could not record email health: %',SQLERRM; END;
 END;
 RETURN NEW;
END;
$fn$;