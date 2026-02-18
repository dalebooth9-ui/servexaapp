-- Enable realtime for jobs table so status changes are pushed live to planner
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;