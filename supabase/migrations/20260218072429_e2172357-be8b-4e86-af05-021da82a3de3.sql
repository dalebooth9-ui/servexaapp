
-- Allow engineers to upload documents to customer_documents
CREATE POLICY "Engineers can insert customer documents"
ON public.customer_documents
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'engineer'::app_role)
  AND uploaded_by = auth.uid()
);

-- Allow engineers to update their own uploaded documents
CREATE POLICY "Engineers can update own customer documents"
ON public.customer_documents
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'engineer'::app_role)
  AND uploaded_by = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'engineer'::app_role)
  AND uploaded_by = auth.uid()
);
