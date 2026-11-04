CREATE TABLE public.ops_notification_requests(org_id uuid NOT NULL REFERENCES public.organisations(id),job_id uuid NOT NULL REFERENCES public.jobs(id),token uuid NOT NULL DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,job_id));
GRANT ALL ON public.ops_notification_requests TO service_role;
ALTER TABLE public.ops_notification_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_requests_service_only ON public.ops_notification_requests FOR ALL TO service_role USING(true) WITH CHECK(true);
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
  INSERT INTO public.ops_notification_requests(org_id,job_id,token) VALUES(NEW.org_id,NEW.id,v_token);
  v_request:=net.http_post(url:='https://geyrqplwjzwdiaeqaeul.supabase.co/functions/v1/send-transactional-email',headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('templateName','new-job-from-api','job_id',NEW.id,'notification_token',v_token,'recipientEmail',v_ops,'idempotencyKey','new-job-'||NEW.id::text,'templateData',jsonb_build_object('jobName',coalesce(NEW.name,NEW.reference_number,'Untitled job'),'customer',coalesce(v_customer,NEW.customer,'Unknown customer'),'priority',NEW.priority,'source',NEW.source,'company_name',v_company)));
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