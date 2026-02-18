
-- Drop the overly permissive insert policy
DROP POLICY "System can insert notifications" ON public.notifications;

-- Only allow inserts via security definer functions (the trigger handles this)
-- No direct insert policy needed since the trigger uses SECURITY DEFINER
