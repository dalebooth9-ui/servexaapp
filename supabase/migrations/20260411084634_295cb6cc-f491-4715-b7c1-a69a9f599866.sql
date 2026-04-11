
-- Create pending WhatsApp scans table
CREATE TABLE public.pending_whatsapp_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engineer_user_id UUID NOT NULL,
  engineer_phone TEXT NOT NULL,
  image_storage_path TEXT NOT NULL,
  extracted_fields JSONB DEFAULT '{}'::jsonb,
  ocr_path TEXT,
  ocr_confidence NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_job_id UUID REFERENCES public.jobs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Validation trigger
CREATE OR REPLACE FUNCTION public.validate_pending_scan_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'reviewed', 'discarded') THEN
    RAISE EXCEPTION 'Invalid scan status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_pending_scan_status
BEFORE INSERT OR UPDATE ON public.pending_whatsapp_scans
FOR EACH ROW EXECUTE FUNCTION public.validate_pending_scan_status();

-- Updated at trigger
CREATE TRIGGER update_pending_whatsapp_scans_updated_at
BEFORE UPDATE ON public.pending_whatsapp_scans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.pending_whatsapp_scans ENABLE ROW LEVEL SECURITY;

-- Admin-only read
CREATE POLICY "Admins can view pending scans"
ON public.pending_whatsapp_scans FOR SELECT
TO authenticated
USING (public.is_admin_direct(auth.uid()));

-- Admin-only update (review/discard)
CREATE POLICY "Admins can update pending scans"
ON public.pending_whatsapp_scans FOR UPDATE
TO authenticated
USING (public.is_admin_direct(auth.uid()));

-- Admin-only delete
CREATE POLICY "Admins can delete pending scans"
ON public.pending_whatsapp_scans FOR DELETE
TO authenticated
USING (public.is_admin_direct(auth.uid()));

-- Service role insert (edge function uses service role key)
CREATE POLICY "Service role can insert pending scans"
ON public.pending_whatsapp_scans FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_direct(auth.uid()));
