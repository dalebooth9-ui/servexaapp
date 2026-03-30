
-- Fix 3: Remove unnecessary tables from Realtime publication to reduce attack surface
-- Keep only tables that genuinely need realtime: jobs, submissions, job_messages, notifications, engineer_locations, job_schedule
ALTER PUBLICATION supabase_realtime DROP TABLE public.field_reports;
ALTER PUBLICATION supabase_realtime DROP TABLE public.submission_comments;
ALTER PUBLICATION supabase_realtime DROP TABLE public.job_activity_log;
ALTER PUBLICATION supabase_realtime DROP TABLE public.asset_sensors;
ALTER PUBLICATION supabase_realtime DROP TABLE public.sensor_readings;
