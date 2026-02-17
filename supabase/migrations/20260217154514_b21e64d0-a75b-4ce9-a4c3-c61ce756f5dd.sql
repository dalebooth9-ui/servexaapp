
-- Create customer_documents table
CREATE TABLE public.customer_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;

-- Admins can manage all documents
CREATE POLICY "Admins can manage all customer documents"
ON public.customer_documents
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Engineers can view documents for customers they have jobs with
CREATE POLICY "Engineers can view customer documents"
ON public.customer_documents
FOR SELECT
USING (has_role(auth.uid(), 'engineer'::app_role));
