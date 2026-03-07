
-- Fix profiles phone/whatsapp exposure
-- Currently engineers can query profiles of other users via CommandPalette.
-- We need to ensure engineers can only see full_name (not phone/whatsapp) of other users.
-- The safest fix is to split: own profile sees everything, others only see full_name.
-- We achieve this by keeping the existing policies but ensuring the CommandPalette
-- and other queries only select full_name (not phone/whatsapp) when searching others.
-- Since RLS controls row-level not column-level, we create a secure view that restricts columns.

-- Create a public profiles view that only exposes non-sensitive fields for general lookup
CREATE OR REPLACE VIEW public.profile_names AS
  SELECT user_id, full_name
  FROM public.profiles;

-- Grant access to authenticated users for the view
GRANT SELECT ON public.profile_names TO authenticated;
