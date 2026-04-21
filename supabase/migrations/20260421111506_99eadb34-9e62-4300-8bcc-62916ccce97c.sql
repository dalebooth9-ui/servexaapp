-- Ensure pg_net is enabled for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Trigger function: when a job is inserted with source = 'Email Triage',
-- call the send-transactional-email edge function to notify ops.
CREATE OR REPLACE FUNCTION public.notify_new_email_triage_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
  v_service_key text;
  v_customer text;
BEGIN
  IF NEW.source IS DISTINCT FROM 'Email Triage' THEN
    RETURN NEW;
  END IF;

  v_url := 'https://geyrqplwjzwdiaeqaeul.supabase.co/functions/v1/send-transactional-email';

  -- Pull service role key from vault (set up by email infra)
  BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'email_queue_service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_service_key := NULL;
  END;

  IF v_service_key IS NULL THEN
    RAISE WARNING 'notify_new_email_triage_job: service role key not found in vault';
    RETURN NEW;
  END IF;

  -- Look up customer name from customer_id if present, else use the text field
  IF NEW.customer_id IS NOT NULL THEN
    SELECT name INTO v_customer FROM public.customers WHERE id = NEW.customer_id;
  END IF;
  v_customer := COALESCE(v_customer, NEW.customer, 'Unknown customer');

  PERFORM extensions.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'templateName', 'new-job-from-api',
      'recipientEmail', 'service@vivafire.co.uk',
      'idempotencyKey', 'new-job-' || NEW.id::text,
      'templateData', jsonb_build_object(
        'jobName', COALESCE(NEW.name, NEW.reference_number, 'Untitled job'),
        'customer', v_customer,
        'priority', COALESCE(NEW.priority, 'medium'),
        'source', NEW.source
      )
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_email_triage_job ON public.jobs;
CREATE TRIGGER trg_notify_new_email_triage_job
AFTER INSERT ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_email_triage_job();