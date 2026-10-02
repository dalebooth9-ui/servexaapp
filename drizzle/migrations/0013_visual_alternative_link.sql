ALTER TABLE public.job_sheet_templates
  ADD COLUMN IF NOT EXISTS visual_template_id uuid REFERENCES public.job_sheet_templates(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.notify_admins_visual_fallback(_job_id uuid, _template_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _org uuid;
BEGIN
  SELECT org_id INTO _org FROM public.jobs WHERE id = _job_id;
  IF _org IS NULL OR _org <> public.get_user_org_id() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  INSERT INTO public.notifications (user_id, org_id, job_id, title, message)
  SELECT ur.user_id, _org, _job_id, 'Visual form not linked',
         'No visual form linked to ' || left(coalesce(_template_name, 'this form'), 200) || ' – using visual-only mode. Link one in form settings.'
  FROM public.user_roles ur
  JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE ur.role = 'admin' AND p.org_id = _org;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_admins_visual_fallback(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_admins_visual_fallback(uuid, text) TO authenticated;