
-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE,
  action VARCHAR(255) NOT NULL,
  resource_id UUID,
  ip_address INET,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for common query patterns
CREATE INDEX idx_audit_logs_org_id ON public.audit_logs(org_id);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_resource_id ON public.audit_logs(resource_id);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Org members can read their org's audit logs
CREATE POLICY "Org members can read audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (public.user_belongs_to_org(org_id));

-- Authenticated users can insert audit logs for their own org
CREATE POLICY "Org members can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND user_id = auth.uid()
  );

-- Only org admins can delete audit logs
CREATE POLICY "Org admins can delete audit logs"
  ON public.audit_logs
  FOR DELETE
  USING (public.is_org_admin(org_id));
