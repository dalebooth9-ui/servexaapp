CREATE TABLE public.email_step_health (org_id uuid NOT NULL REFERENCES public.organisations(id), step text NOT NULL CHECK (step IN ('email_triage_ops','renewal_reminders')), status text NOT NULL CHECK (status IN ('pending','queued','failed','skipped')), error_message text, request_id bigint, job_id uuid, notification_token uuid, checked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(org_id,step));
GRANT ALL ON public.email_step_health TO service_role;
ALTER TABLE public.email_step_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_health_admin_read ON public.email_step_health FOR SELECT TO authenticated USING(org_id=public.get_user_org_id() AND public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE FUNCTION public.notify_new_email_triage_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,net AS $fn$
DECLARE v_ops text; v_company text; v_customer text; v_request bigint; v_error text; v_token uuid:=gen_random_uuid();
BEGIN
 IF NEW.source IS DISTINCT FROM 'Email Triage' THEN RETURN NEW; END IF;
 BEGIN
  SELECT name INTO v_company FROM public.organisations WHERE id=NEW.org_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Job company is missing'; END IF;
  SELECT coalesce(nullif(trim(reply_to),''),nullif(trim(from_address),'')) INTO v_ops FROM public.email_branding WHERE org_id=NEW.org_id;
  IF v_ops IS NULL THEN RAISE EXCEPTION 'Company ops address is not configured in Email branding'; END IF;
  SELECT name INTO v_customer FROM public.customers WHERE id=NEW.customer_id AND org_id=NEW.org_id;
  INSERT INTO public.email_step_health(org_id,step,status,job_id,notification_token,error_message,checked_at) VALUES(NEW.org_id,'email_triage_ops','pending',NEW.id,v_token,NULL,now()) ON CONFLICT(org_id,step) DO UPDATE SET status='pending',job_id=excluded.job_id,notification_token=excluded.notification_token,request_id=NULL,error_message=NULL,checked_at=excluded.checked_at;
  v_request:=net.http_post(url:='https://geyrqplwjzwdiaeqaeul.supabase.co/functions/v1/send-transactional-email',headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('templateName','new-job-from-api','job_id',NEW.id,'notification_token',v_token,'recipientEmail',v_ops,'idempotencyKey','new-job-'||NEW.id::text,'templateData',jsonb_build_object('jobName',coalesce(NEW.name,NEW.reference_number,'Untitled job'),'customer',coalesce(v_customer,NEW.customer,'Unknown customer'),'priority',NEW.priority,'source',NEW.source,'company_name',v_company)));
  UPDATE public.email_step_health SET request_id=v_request WHERE org_id=NEW.org_id AND step='email_triage_ops';
 EXCEPTION WHEN OTHERS THEN
  v_error:=SQLSTATE||': '||SQLERRM;
  RAISE WARNING 'Email Triage job % saved; ops notification failed: %',NEW.id,v_error;
  BEGIN
   INSERT INTO public.email_step_health(org_id,step,status,error_message,checked_at) VALUES(NEW.org_id,'email_triage_ops','failed',v_error,now()) ON CONFLICT(org_id,step) DO UPDATE SET status='failed',error_message=excluded.error_message,notification_token=NULL,request_id=NULL,checked_at=excluded.checked_at;
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Could not record email health: %',SQLERRM; END;
 END;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.notify_new_email_triage_job() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_email_step_health() RETURNS TABLE(step text,status text,error_message text,checked_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,net AS $fn$
DECLARE v_org uuid:=public.get_user_org_id();
BEGIN
 IF v_org IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Company admin required'; END IF;
 RETURN QUERY SELECT h.step,CASE WHEN h.status='pending' AND (r.error_msg IS NOT NULL OR r.status_code>=400) THEN 'failed' WHEN h.status='pending' AND r.status_code BETWEEN 200 AND 299 THEN 'queued' WHEN h.status='pending' AND h.checked_at<now()-interval '5 minutes' AND r.id IS NULL THEN 'failed' ELSE h.status END,CASE WHEN h.status='pending' AND r.error_msg IS NOT NULL THEN left(r.error_msg,500) WHEN h.status='pending' AND r.status_code>=400 THEN 'Ops notification rejected (HTTP '||r.status_code||'). Check email configuration.' WHEN h.status='pending' AND h.checked_at<now()-interval '5 minutes' AND r.id IS NULL THEN 'Ops notification did not return a result. Check email service logs.' ELSE h.error_message END,h.checked_at FROM public.email_step_health h LEFT JOIN net._http_response r ON r.id=h.request_id WHERE h.org_id=v_org;
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_email_step_health() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_email_step_health() TO authenticated,service_role;