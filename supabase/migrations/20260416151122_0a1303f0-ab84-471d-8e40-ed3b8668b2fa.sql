
-- =============================================
-- FIX 1: Remove permissive INSERT policy on organisations
-- that allows ANY authenticated user to create an org
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can create an org" ON public.organisations;
DROP POLICY IF EXISTS "Authenticated users can create organisations" ON public.organisations;

-- =============================================
-- FIX 2: Restrict public bucket file listing
-- Replace broad SELECT policies with path-scoped ones
-- =============================================

-- Drop existing overly-broad policies on storage.objects for public buckets
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Public bucket read access" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read public bucket objects" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access on templates" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access on customer-logos" ON storage.objects;
DROP POLICY IF EXISTS "Templates are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Customer logos are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "public_read_templates" ON storage.objects;
DROP POLICY IF EXISTS "public_read_customer_logos" ON storage.objects;

-- Recreate scoped read policies — allow reading individual files but not listing
CREATE POLICY "public_read_templates" ON storage.objects
FOR SELECT USING (
  bucket_id = 'templates'
  AND (storage.foldername(name))[1] IS NOT NULL
);

CREATE POLICY "public_read_customer_logos" ON storage.objects
FOR SELECT USING (
  bucket_id = 'customer-logos'
  AND (storage.foldername(name))[1] IS NOT NULL
);
