
-- Create a sequence for VFP job numbers
CREATE SEQUENCE IF NOT EXISTS public.vfp_job_seq START WITH 1;

-- Set the sequence to the next available number based on existing VFP references
DO $$
DECLARE
  max_num integer;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(reference_number FROM 5) AS integer)), 0)
  INTO max_num
  FROM jobs
  WHERE reference_number ~ '^VFP-[0-9]+$';
  
  IF max_num > 0 THEN
    PERFORM setval('public.vfp_job_seq', max_num);
  END IF;
END $$;

-- Create a function to generate VFP reference numbers
CREATE OR REPLACE FUNCTION public.generate_vfp_reference()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 'VFP-' || LPAD(nextval('vfp_job_seq')::text, 5, '0');
$$;

-- Create a trigger to auto-assign reference_number if empty or not provided
CREATE OR REPLACE FUNCTION public.auto_assign_job_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.reference_number IS NULL OR NEW.reference_number = '' THEN
    NEW.reference_number := generate_vfp_reference();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_assign_job_reference
BEFORE INSERT ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_job_reference();
