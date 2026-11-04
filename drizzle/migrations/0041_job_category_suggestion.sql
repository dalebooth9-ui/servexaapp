ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS category_suggestion text CHECK (category_suggestion IN ('suggested','needs_type'));
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS category_other_types text[];
COMMENT ON COLUMN public.jobs.category_suggestion IS 'How the job type was set by PO intake: suggested (confident match on the company''s own job types) or needs_type (uncertain; office must choose). Null once confirmed or set manually.';
COMMENT ON COLUMN public.jobs.category_other_types IS 'Other job type names detected in the same PO, shown as a note.';