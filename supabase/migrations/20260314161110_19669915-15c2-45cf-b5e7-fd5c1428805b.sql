
-- Create engineer leave table
CREATE TABLE public.engineer_leave (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engineer_id UUID NOT NULL,
  leave_type TEXT NOT NULL DEFAULT 'holiday',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by UUID NOT NULL,
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT engineer_leave_type_check CHECK (leave_type IN ('holiday', 'sick', 'bank_holiday')),
  CONSTRAINT engineer_leave_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

ALTER TABLE public.engineer_leave ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all leave"
  ON public.engineer_leave
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view own leave"
  ON public.engineer_leave
  FOR SELECT
  USING (engineer_id = auth.uid());

CREATE POLICY "Engineers can request leave"
  ON public.engineer_leave
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'engineer'::app_role)
    AND engineer_id = auth.uid()
    AND requested_by = auth.uid()
    AND status = 'pending'
  );

CREATE POLICY "Engineers can delete own pending leave"
  ON public.engineer_leave
  FOR DELETE
  USING (engineer_id = auth.uid() AND status = 'pending');

CREATE TRIGGER update_engineer_leave_updated_at
  BEFORE UPDATE ON public.engineer_leave
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_engineer_leave_engineer_dates 
  ON public.engineer_leave (engineer_id, start_date, end_date);

CREATE INDEX idx_engineer_leave_status 
  ON public.engineer_leave (status);
