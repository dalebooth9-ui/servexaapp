-- =====================================================================
-- Multi-tenant migration STEP 2: add org_id to every tenant-data table
-- =====================================================================
DO $mig$
DECLARE viva constant uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organisations WHERE id = viva) THEN
    RAISE EXCEPTION 'Viva Fire org % not found — aborting', viva;
  END IF;
END $mig$;

-- 1. Backfill existing NULL org_id on scoped tables
UPDATE public.jobs                     SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.customers                SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.sites                    SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.assets                   SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.invoices                 SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.profiles                 SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.compliance_records       SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.job_sheet_templates      SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.parts_library            SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.audit_logs               SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.van_stock                SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.stock_transactions       SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.support_tickets          SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.client_errors            SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.customer_portal_tokens   SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.handover_tokens          SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.fire_log_entries         SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.fire_log_tokens          SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.site_surveys             SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.engineer_onboarding_logs SET org_id='11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;

-- 2. Add org_id (default Viva) + NOT NULL + FK + index to every listed table
DO $mig$
DECLARE
  viva constant uuid := '11111111-1111-1111-1111-111111111111';
  t text;
  tables text[] := ARRAY[
    'job_visits','job_assignments','job_activity_log','job_messages','job_documents',
    'job_parts','job_signatures','job_schedule','job_photo_checklists',
    'job_photo_checklist_responses','job_sheet_responses','job_site_surveys',
    'job_site_survey_photos','job_template_locks','submissions','submission_comments',
    'customer_sign_off_tokens','defects','conformity_certificates',
    'customer_notification_log','field_reports','notifications',
    'pending_whatsapp_scans','quote_approval_tokens','rams','rams_documents','generic_rams',
    'planner_adhoc_entries','pre_completion_checklist_items',
    'customer_documents','customer_paperwork','customer_sites','customer_merge_suggestions',
    'asset_documents','asset_sensors','sensor_readings','digital_twin_health','ppm_schedules',
    'audits','audit_responses',
    'installation_projects','installation_issues','installation_issue_photos',
    'installation_issue_history','installation_handover_tokens',
    'invoice_line_items','site_survey_photos',
    'vehicle_checks','time_clock','engineer_leave','engineer_documents',
    'engineer_locations','engineer_page_access',
    'app_settings','email_from_settings','xero_connections',
    'ai_wizard_conversations','email_send_log','email_unsubscribe_tokens'
  ];
  col_exists boolean;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='org_id'
    ) INTO col_exists;

    IF NOT col_exists THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN org_id uuid DEFAULT %L', t, viva);
    END IF;
    EXECUTE format('UPDATE public.%I SET org_id=%L WHERE org_id IS NULL', t, viva);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET DEFAULT %L', t, viva);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', t);

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attnum=ANY(c.conkey) AND a.attrelid=c.conrelid
      WHERE c.contype='f' AND c.conrelid = ('public.'||t)::regclass AND a.attname='org_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (org_id) REFERENCES public.organisations(id) ON DELETE RESTRICT',
        t, t||'_org_id_fkey'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename=t AND indexname=t||'_org_id_idx'
    ) THEN
      EXECUTE format('CREATE INDEX %I ON public.%I(org_id)', t||'_org_id_idx', t);
    END IF;
  END LOOP;
END $mig$;

-- 3. Two-org fixture test (cleaned up at end)
DO $test$
DECLARE
  viva constant uuid := '11111111-1111-1111-1111-111111111111';
  org_b uuid;
  cust_a uuid; cust_b uuid;
  job_a uuid;  job_b uuid;
  n int;
  default_val text;
BEGIN
  INSERT INTO public.organisations (name, slug)
    VALUES ('__mig2_TestOrgB', '__mig2-test-org-b')
    RETURNING id INTO org_b;

  INSERT INTO public.customers (name, org_id) VALUES ('__mig2_A', viva)  RETURNING id INTO cust_a;
  INSERT INTO public.customers (name, org_id) VALUES ('__mig2_B', org_b) RETURNING id INTO cust_b;

  INSERT INTO public.jobs (name, customer_id, org_id, priority, category, status)
    VALUES ('__mig2_Job_A', cust_a, viva,  'medium','general','active') RETURNING id INTO job_a;
  INSERT INTO public.jobs (name, customer_id, org_id, priority, category, status)
    VALUES ('__mig2_Job_B', cust_b, org_b, 'medium','general','active') RETURNING id INTO job_b;

  INSERT INTO public.job_visits (job_id, scheduled_date, status, org_id)
    VALUES (job_a, CURRENT_DATE, 'upcoming', viva);
  INSERT INTO public.job_visits (job_id, scheduled_date, status, org_id)
    VALUES (job_b, CURRENT_DATE, 'upcoming', org_b);

  -- Cross-org visibility assertions
  SELECT count(*) INTO n FROM public.jobs        WHERE org_id = viva  AND id = job_b;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: job_b visible under viva scope'; END IF;
  SELECT count(*) INTO n FROM public.jobs        WHERE org_id = org_b AND id = job_a;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: job_a visible under org_b scope'; END IF;
  SELECT count(*) INTO n FROM public.customers   WHERE org_id = viva  AND id = cust_b;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: cust_b visible under viva scope'; END IF;
  SELECT count(*) INTO n FROM public.customers   WHERE org_id = org_b AND id = cust_a;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: cust_a visible under org_b scope'; END IF;
  SELECT count(*) INTO n FROM public.job_visits  WHERE org_id = viva  AND job_id = job_b;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: job_visit_b visible under viva'; END IF;
  SELECT count(*) INTO n FROM public.job_visits  WHERE org_id = org_b AND job_id = job_a;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: job_visit_a visible under org_b'; END IF;

  -- Prove DEFAULT is in place on a representative sample of new columns
  FOR default_val IN
    SELECT column_default FROM information_schema.columns
    WHERE table_schema='public' AND column_name='org_id'
      AND table_name IN ('job_visits','job_messages','notifications','customer_documents','vehicle_checks')
  LOOP
    IF default_val IS NULL OR position(viva::text IN default_val) = 0 THEN
      RAISE EXCEPTION 'FAIL: org_id default not set to viva on one of the sample tables (got %)', default_val;
    END IF;
  END LOOP;

  -- Cleanup
  DELETE FROM public.job_visits  WHERE job_id IN (job_a, job_b);
  DELETE FROM public.jobs        WHERE id IN (job_a, job_b);
  DELETE FROM public.customers   WHERE id IN (cust_a, cust_b);
  DELETE FROM public.organisations WHERE id = org_b;

  RAISE NOTICE 'Step 2 two-org fixture: all assertions passed';
END $test$;