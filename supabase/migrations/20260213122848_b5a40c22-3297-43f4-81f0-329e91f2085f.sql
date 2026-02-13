-- Revoke all permissions from anon role on all five tables
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.jobs FROM anon;
REVOKE ALL ON public.submissions FROM anon;
REVOKE ALL ON public.job_assignments FROM anon;