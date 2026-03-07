-- Add logo_url column to customers table
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Create a public bucket for customer logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-logos', 'customer-logos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for customer-logos bucket: admins can upload/delete, anyone can view (public)
CREATE POLICY "Admins can upload customer logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'customer-logos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update customer logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'customer-logos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete customer logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'customer-logos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Customer logos are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'customer-logos');