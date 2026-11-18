CREATE OR REPLACE FUNCTION public.platform_list_organisations()
 RETURNS TABLE(id uuid, name text, slug text, plan text, status text, suspension_reason text, suspension_message text, suspended_at timestamp with time zone, created_at timestamp with time zone, user_count bigint, job_count bigint, last_activity timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform admin role required'; END IF;
  RETURN QUERY
  SELECT o.id, o.name, o.slug, o.plan, o.status,
         o.suspension_reason, o.suspension_message, o.suspended_at, o.created_at,
         (SELECT count(*) FROM public.organisation_members m WHERE m.org_id = o.id AND m.status = 'active'),
         (SELECT count(*) FROM public.jobs j WHERE j.org_id = o.id),
         GREATEST(
           COALESCE((SELECT max(j2.updated_at) FROM public.jobs j2 WHERE j2.org_id = o.id), o.created_at),
           COALESCE((SELECT max(jal.created_at) FROM public.job_activity_log jal
                      JOIN public.jobs jj ON jj.id = jal.job_id WHERE jj.org_id = o.id), o.created_at)
         )
  FROM public.organisations o ORDER BY o.created_at DESC;
END $function$;