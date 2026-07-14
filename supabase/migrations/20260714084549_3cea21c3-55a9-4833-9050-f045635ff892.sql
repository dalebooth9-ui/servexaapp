
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ai_wizard_conversations',
    'asset_documents',
    'asset_sensors',
    'audit_responses',
    'audits',
    'compliance_records',
    'conformity_certificates',
    'customer_documents',
    'customer_paperwork',
    'defects',
    'digital_twin_health',
    'engineer_documents',
    'engineer_leave',
    'engineer_locations',
    'engineer_page_access',
    'field_reports',
    'fire_log_entries',
    'generic_rams',
    'import_batches',
    'installation_issue_history',
    'installation_issue_photos',
    'installation_issues',
    'installation_projects',
    'invoice_line_items',
    'invoices',
    'job_activity_log',
    'job_assignments',
    'job_messages',
    'job_parts',
    'job_photo_checklist_responses',
    'job_photo_checklists',
    'job_schedule',
    'job_sheet_templates',
    'job_signatures',
    'job_site_survey_photos',
    'job_site_surveys',
    'job_template_locks',
    'job_visits',
    'parts_library',
    'planner_adhoc_entries',
    'ppm_schedules',
    'pre_completion_checklist_items',
    'rams',
    'rams_documents',
    'sensor_readings',
    'site_survey_photos',
    'site_surveys',
    'stock_transactions',
    'submission_comments',
    'submissions',
    'support_tickets',
    'time_clock',
    'user_roles',
    'van_stock',
    'vehicle_checks',
    'vehicles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Only proceed if the table has an org_id column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='org_id'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_force_org_id ON public.%I;', t, t);
      EXECUTE format(
        'CREATE TRIGGER trg_%I_force_org_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.force_org_id_from_user();',
        t, t
      );
    END IF;
  END LOOP;
END $$;
